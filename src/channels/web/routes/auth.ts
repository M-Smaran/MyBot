/**
 * Google OAuth2 Routes
 *
 * GET  /api/auth/google          – returns the Google consent URL
 * GET  /api/auth/google/callback – exchanges auth code for tokens, saves them, redirects to UI
 */

import { Router } from 'express';
import { createModuleLogger } from '../../../utils/logger.js';
import { encryptAPIKey } from '../encryption.js';
import { saveOAuthCalendarCredential } from '../../../memory/database.js';
import { initializeGoogleCalendarOAuth } from '../../../tools/calendar/google-calendar.js';

const logger = createModuleLogger('auth-routes');
const router = Router();

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const AUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

function getOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/auth/google/callback';
  return { clientId, clientSecret, redirectUri };
}

/**
 * GET /api/auth/google
 * Returns the Google OAuth consent URL for the frontend to redirect to.
 */
router.get('/google', (req, res) => {
  const { clientId, redirectUri } = getOAuthConfig();

  if (!clientId) {
    return res.status(503).json({
      error: 'Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env',
    });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
  });

  const url = `${AUTH_BASE}?${params.toString()}`;
  res.json({ url });
});

/**
 * GET /api/auth/google/callback
 * Google redirects here after the user grants permission.
 * Exchanges the code for tokens, saves them, then redirects to the UI.
 */
router.get('/google/callback', async (req, res) => {
  const code = req.query.code as string;
  const error = req.query.error as string;

  if (error) {
    logger.warn(`OAuth cancelled or denied: ${error}`);
    return res.redirect('http://localhost:5173/settings?calendar=error');
  }

  if (!code) {
    return res.redirect('http://localhost:5173/settings?calendar=error');
  }

  try {
    const { clientId, clientSecret, redirectUri } = getOAuthConfig();

    if (!clientId || !clientSecret) {
      throw new Error('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set');
    }

    // Exchange auth code for tokens
    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      throw new Error(`Token exchange failed: ${err}`);
    }

    const tokens: any = await tokenRes.json();
    const { access_token, refresh_token } = tokens;

    if (!refresh_token) {
      throw new Error('No refresh_token returned. Try revoking access at myaccount.google.com/permissions and reconnecting.');
    }

    // Get user email
    const userRes = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const userInfo: any = await userRes.json();
    const email = userInfo.email || 'unknown@google.com';

    // Encrypt and store the tokens (store as JSON)
    const tokenJson = JSON.stringify({ access_token, refresh_token, client_id: clientId, client_secret: clientSecret });
    const { encrypted, iv } = encryptAPIKey(tokenJson);
    saveOAuthCalendarCredential(encrypted, iv, email);

    // Initialise the calendar client right away
    initializeGoogleCalendarOAuth(access_token, refresh_token, clientId, clientSecret);

    logger.info(`Google Calendar connected via OAuth for ${email}`);

    // Redirect back to frontend settings page with success indicator
    return res.redirect('http://localhost:5173/settings?calendar=connected');
  } catch (err: any) {
    logger.error(`OAuth callback error: ${err.message}`);
    return res.redirect(`http://localhost:5173/settings?calendar=error&msg=${encodeURIComponent(err.message)}`);
  }
});

export default router;
