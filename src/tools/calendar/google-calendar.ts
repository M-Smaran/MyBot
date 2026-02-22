/**
 * Google Calendar Client
 *
 * Uses the Google Calendar REST API directly via fetch + service account JWT auth.
 * No googleapis npm package required — only Node.js built-ins (crypto) and fetch.
 */

import { createSign } from 'crypto';
import { createModuleLogger } from '../../utils/logger.js';

const logger = createModuleLogger('google-calendar');

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: { email: string; displayName?: string; responseStatus?: string }[];
  status?: string;
  htmlLink?: string;
  organizer?: { email: string; displayName?: string };
}

export interface CalendarInfo {
  id: string;
  summary: string;
  description?: string;
  timeZone?: string;
  primary?: boolean;
}

export interface FreeBusySlot {
  start: string;
  end: string;
}

export interface CreateEventInput {
  calendarId?: string;
  summary: string;
  description?: string;
  location?: string;
  startDateTime: string;
  endDateTime: string;
  timeZone?: string;
  attendeeEmails?: string[];
  sendNotifications?: boolean;
}

export interface UpdateEventInput {
  calendarId?: string;
  eventId: string;
  summary?: string;
  description?: string;
  location?: string;
  startDateTime?: string;
  endDateTime?: string;
  timeZone?: string;
  attendeeEmails?: string[];
}

// ── Service account state ────────────────────────────────────────────────────

interface ServiceAccount {
  client_email: string;
  private_key: string;
  private_key_id?: string;
}

let serviceAccount: ServiceAccount | null = null;
let cachedToken: string | null = null;
let tokenExpiry = 0;

export function isCalendarInitialized(): boolean {
  return serviceAccount !== null;
}

/**
 * Load service account credentials from the JSON string.
 * Call this at server startup and after saving new credentials.
 */
export async function initializeGoogleCalendar(serviceAccountJson: string): Promise<void> {
  try {
    const parsed = JSON.parse(serviceAccountJson);
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error('Missing client_email or private_key in service account JSON');
    }
    serviceAccount = {
      client_email: parsed.client_email,
      private_key: parsed.private_key,
      private_key_id: parsed.private_key_id,
    };
    // Reset cached token so the next request gets a fresh one
    cachedToken = null;
    tokenExpiry = 0;
    logger.info(`Google Calendar initialised for ${serviceAccount.client_email}`);
  } catch (err: any) {
    serviceAccount = null;
    throw new Error(`Invalid service account JSON: ${err.message}`);
  }
}

// ── JWT / OAuth helpers ──────────────────────────────────────────────────────

function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && tokenExpiry > now + 60) return cachedToken;

  if (!serviceAccount) throw new Error('Google Calendar not initialised');

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: CALENDAR_SCOPE,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now,
  }));

  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const sig = base64url(sign.sign(serviceAccount.private_key));

  const jwt = `${header}.${payload}.${sig}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get access token: ${err}`);
  }

  const data: any = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = now + (data.expires_in || 3600);
  return cachedToken!;
}

async function calRequest(
  method: string,
  path: string,
  body?: unknown,
  query?: Record<string, string | number | boolean | undefined>
): Promise<any> {
  const token = await getAccessToken();

  let url = `${CALENDAR_BASE}${path}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null; // DELETE responses

  const data = await res.json() as any;
  if (!res.ok) {
    throw new Error(data?.error?.message || `Calendar API error ${res.status}`);
  }
  return data;
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function listCalendars(): Promise<CalendarInfo[]> {
  const data = await calRequest('GET', '/users/me/calendarList');
  return (data.items || []).map((c: any) => ({
    id: c.id,
    summary: c.summary,
    description: c.description,
    timeZone: c.timeZone,
    primary: c.primary || false,
  }));
}

export async function listEvents(
  calendarId = 'primary',
  timeMin?: string,
  timeMax?: string,
  maxResults = 20
): Promise<CalendarEvent[]> {
  const now = new Date().toISOString();
  const weekLater = new Date(Date.now() + 7 * 86400000).toISOString();

  const data = await calRequest('GET', `/calendars/${encodeURIComponent(calendarId)}/events`, undefined, {
    maxResults: Math.min(maxResults, 50),
    singleEvents: true,
    orderBy: 'startTime',
    timeMin: timeMin || now,
    timeMax: timeMax || weekLater,
  });

  return (data.items || []).map(mapEvent);
}

export async function getEvent(eventId: string, calendarId = 'primary'): Promise<CalendarEvent> {
  const data = await calRequest('GET', `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`);
  return mapEvent(data);
}

export async function createEvent(input: CreateEventInput): Promise<CalendarEvent> {
  const calendarId = input.calendarId || 'primary';
  const body: any = {
    summary: input.summary,
    description: input.description,
    location: input.location,
    start: { dateTime: input.startDateTime, timeZone: input.timeZone || 'UTC' },
    end: { dateTime: input.endDateTime, timeZone: input.timeZone || 'UTC' },
  };
  if (input.attendeeEmails?.length) {
    body.attendees = input.attendeeEmails.map(email => ({ email }));
  }

  const sendUpdates = input.sendNotifications !== false ? 'all' : 'none';
  const data = await calRequest(
    'POST',
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    body,
    { sendUpdates }
  );
  logger.info(`Created event: ${data.id}`);
  return mapEvent(data);
}

export async function updateEvent(input: UpdateEventInput): Promise<CalendarEvent> {
  const calendarId = input.calendarId || 'primary';

  // Fetch existing first so we only patch changed fields
  const existing = await getEvent(input.eventId, calendarId);
  const patch: any = { ...existing };

  if (input.summary) patch.summary = input.summary;
  if (input.description !== undefined) patch.description = input.description;
  if (input.location !== undefined) patch.location = input.location;
  if (input.startDateTime) {
    patch.start = { dateTime: input.startDateTime, timeZone: input.timeZone || existing.start.timeZone || 'UTC' };
  }
  if (input.endDateTime) {
    patch.end = { dateTime: input.endDateTime, timeZone: input.timeZone || existing.end.timeZone || 'UTC' };
  }
  if (input.attendeeEmails) {
    patch.attendees = input.attendeeEmails.map(email => ({ email }));
  }

  const data = await calRequest(
    'PUT',
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(input.eventId)}`,
    patch,
    { sendUpdates: 'all' }
  );
  logger.info(`Updated event: ${input.eventId}`);
  return mapEvent(data);
}

export async function deleteEvent(
  eventId: string,
  calendarId = 'primary',
  sendNotifications = true
): Promise<void> {
  await calRequest(
    'DELETE',
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    undefined,
    { sendUpdates: sendNotifications ? 'all' : 'none' }
  );
  logger.info(`Deleted event: ${eventId}`);
}

export async function checkFreeBusy(
  calendarIds: string[],
  timeMin: string,
  timeMax: string
): Promise<{ calendar: string; busySlots: FreeBusySlot[] }[]> {
  const data = await calRequest('POST', '/freeBusy', {
    timeMin,
    timeMax,
    items: calendarIds.map(id => ({ id })),
  });

  const calendars = data.calendars || {};
  return calendarIds.map(id => ({
    calendar: id,
    busySlots: (calendars[id]?.busy || []).map((s: any) => ({ start: s.start, end: s.end })),
  }));
}

function mapEvent(e: any): CalendarEvent {
  return {
    id: e.id,
    summary: e.summary || '(No title)',
    description: e.description,
    location: e.location,
    start: e.start,
    end: e.end,
    attendees: e.attendees,
    status: e.status,
    htmlLink: e.htmlLink,
    organizer: e.organizer,
  };
}
