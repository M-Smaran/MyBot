/**
 * Settings Routes
 *
 * API endpoints for managing API keys and settings.
 */

import { Router } from 'express';
import {
  getAllAPIKeys,
  createAPIKey,
  setActiveAPIKey,
  deleteAPIKey,
  saveCalendarCredential,
  getCalendarCredential,
  deleteCalendarCredential,
} from '../../../memory/database.js';
import { encryptAPIKey, maskAPIKey } from '../encryption.js';
import { createModuleLogger } from '../../../utils/logger.js';
import { initializeGoogleCalendar } from '../../../tools/calendar/google-calendar.js';

const router = Router();
const logger = createModuleLogger('settings-routes');

/**
 * GET /api/settings/api-keys
 * Get all API keys (with masked values)
 */
router.get('/api-keys', (req, res) => {
  try {
    const keys = getAllAPIKeys();

    // Mask the keys before sending to frontend
    const maskedKeys = keys.map(key => ({
      id: key.id,
      provider: key.provider,
      name: key.name,
      isActive: key.isActive === 1,
      createdAt: key.createdAt,
      lastUsed: key.lastUsed,
      // Don't send encrypted key or IV to frontend
    }));

    res.json({ keys: maskedKeys });
  } catch (error: any) {
    logger.error('Failed to get API keys', { error: error.message });
    res.status(500).json({ error: 'Failed to get API keys' });
  }
});

/**
 * POST /api/settings/api-keys
 * Add a new API key
 */
router.post('/api-keys', (req, res) => {
  try {
    const { provider, apiKey, name } = req.body;

    if (!provider || !apiKey) {
      return res.status(400).json({ error: 'Provider and API key are required' });
    }

    // Validate provider
    const validProviders = ['openai', 'anthropic', 'gemini', 'kimi', 'together', 'groq'];
    if (!validProviders.includes(provider)) {
      return res.status(400).json({ error: `Invalid provider. Must be one of: ${validProviders.join(', ')}` });
    }

    // Encrypt the API key
    const { encrypted, iv } = encryptAPIKey(apiKey);

    // Store in database
    const newKey = createAPIKey(provider, encrypted, iv, name || null);

    logger.info(`Created new API key for provider: ${provider}`);

    res.json({
      id: newKey.id,
      provider: newKey.provider,
      name: newKey.name,
      keyPreview: maskAPIKey(apiKey),
      isActive: newKey.isActive === 1,
      createdAt: newKey.createdAt,
    });
  } catch (error: any) {
    logger.error('Failed to create API key', { error: error.message });
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

/**
 * POST /api/settings/api-keys/:id/activate
 * Set an API key as active
 */
router.post('/api-keys/:id/activate', (req, res) => {
  try {
    const keyId = parseInt(req.params.id, 10);

    if (isNaN(keyId)) {
      return res.status(400).json({ error: 'Invalid key ID' });
    }

    const success = setActiveAPIKey(keyId);

    if (!success) {
      return res.status(404).json({ error: 'API key not found' });
    }

    logger.info(`Activated API key: ${keyId}`);

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Failed to activate API key', { error: error.message });
    res.status(500).json({ error: 'Failed to activate API key' });
  }
});

/**
 * DELETE /api/settings/api-keys/:id
 * Delete an API key
 */
router.delete('/api-keys/:id', (req, res) => {
  try {
    const keyId = parseInt(req.params.id, 10);

    if (isNaN(keyId)) {
      return res.status(400).json({ error: 'Invalid key ID' });
    }

    const success = deleteAPIKey(keyId);

    if (!success) {
      return res.status(404).json({ error: 'API key not found' });
    }

    logger.info(`Deleted API key: ${keyId}`);

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Failed to delete API key', { error: error.message });
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

// ============================================
// Calendar Credential Routes
// ============================================

/**
 * GET /api/settings/calendar
 * Returns whether calendar credentials are configured (no secrets)
 */
router.get('/calendar', (req, res) => {
  try {
    const cred = getCalendarCredential('google');
    res.json({
      configured: !!cred,
      authType: cred?.authType || null,
      label: cred?.label || null,
      email: cred?.oauthEmail || null,
      createdAt: cred?.createdAt || null,
    });
  } catch (error: any) {
    logger.error('Failed to get calendar status', { error: error.message });
    res.status(500).json({ error: 'Failed to get calendar status' });
  }
});

/**
 * POST /api/settings/calendar
 * Save (or replace) Google service account JSON credentials
 */
router.post('/calendar', async (req, res) => {
  try {
    const { serviceAccountJson, label } = req.body;

    if (!serviceAccountJson) {
      return res.status(400).json({ error: 'serviceAccountJson is required' });
    }

    // Validate it's valid JSON with required fields
    let parsed: any;
    try {
      parsed = JSON.parse(serviceAccountJson);
    } catch {
      return res.status(400).json({ error: 'Invalid JSON — paste the full service account key file content' });
    }

    if (!parsed.type || parsed.type !== 'service_account') {
      return res.status(400).json({ error: 'Invalid service account file — "type" must be "service_account"' });
    }
    if (!parsed.client_email || !parsed.private_key) {
      return res.status(400).json({ error: 'Service account JSON must contain client_email and private_key' });
    }

    // Test the credentials before saving
    try {
      await initializeGoogleCalendar(serviceAccountJson);
    } catch (error: any) {
      return res.status(400).json({ error: `Invalid credentials: ${error.message}` });
    }

    // Encrypt and save
    const { encrypted, iv } = encryptAPIKey(serviceAccountJson);
    const cred = saveCalendarCredential(encrypted, iv, label || `${parsed.client_email}`, 'google');

    logger.info(`Saved Google Calendar credentials for: ${parsed.client_email}`);
    res.json({
      success: true,
      configured: true,
      label: cred.label,
      createdAt: cred.createdAt,
      clientEmail: parsed.client_email,
    });
  } catch (error: any) {
    logger.error('Failed to save calendar credentials', { error: error.message });
    res.status(500).json({ error: 'Failed to save calendar credentials' });
  }
});

/**
 * DELETE /api/settings/calendar
 * Remove calendar credentials
 */
router.delete('/calendar', (req, res) => {
  try {
    const deleted = deleteCalendarCredential('google');
    res.json({ success: deleted });
  } catch (error: any) {
    logger.error('Failed to delete calendar credentials', { error: error.message });
    res.status(500).json({ error: 'Failed to delete calendar credentials' });
  }
});

export default router;
