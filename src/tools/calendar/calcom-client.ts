/**
 * Cal.com API Client
 *
 * Uses the Cal.com REST API v1 with API key authentication.
 * No external packages required — uses native fetch.
 */

import { createModuleLogger } from '../../utils/logger.js';

const logger = createModuleLogger('calcom-client');
const CALCOM_BASE = 'https://api.cal.com/v1';

// ── State ────────────────────────────────────────────────────────────────────

let apiKey: string | null = null;

export function initializeCalcom(key: string): void {
  apiKey = key;
  logger.info('Cal.com client initialized');
}

export function isCalcomInitialized(): boolean {
  return apiKey !== null;
}

export function resetCalcom(): void {
  apiKey = null;
}

// ── Interfaces ───────────────────────────────────────────────────────────────

export interface CalcomEventType {
  id: number;
  title: string;
  slug: string;
  description?: string;
  length: number; // minutes
  hidden: boolean;
  position: number;
}

export interface CalcomBooking {
  id: number;
  uid: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  status: string;
  attendees: { name: string; email: string; timeZone?: string }[];
  location?: string;
  eventType?: { id: number; title: string; slug: string };
}

export interface CalcomSlot {
  time: string; // ISO datetime
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function calRequest(
  method: string,
  path: string,
  body?: unknown,
  query?: Record<string, string | number | boolean | undefined>
): Promise<any> {
  if (!apiKey) throw new Error('Cal.com not initialized. Please add your Cal.com API key in Settings.');

  const params = new URLSearchParams({ apiKey });
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) params.set(k, String(v));
    }
  }

  const url = `${CALCOM_BASE}${path}?${params.toString()}`;

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  const data = await res.json() as any;
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `Cal.com API error ${res.status}`);
  }
  return data;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * List all event types (booking pages) for the authenticated user.
 */
export async function listEventTypes(): Promise<CalcomEventType[]> {
  const data = await calRequest('GET', '/event-types');
  const items = data?.event_types ?? data?.eventTypes ?? data?.data ?? [];
  return items.map((e: any) => ({
    id: e.id,
    title: e.title,
    slug: e.slug,
    description: e.description,
    length: e.length,
    hidden: e.hidden ?? false,
    position: e.position ?? 0,
  }));
}

/**
 * List bookings for the authenticated user.
 */
export async function listBookings(status?: 'upcoming' | 'recurring' | 'past' | 'cancelled'): Promise<CalcomBooking[]> {
  const data = await calRequest('GET', '/bookings', undefined, status ? { status } : undefined);
  const items = data?.bookings ?? data?.data ?? [];
  return items.map(mapBooking);
}

/**
 * Get a single booking by ID.
 */
export async function getBooking(bookingId: number): Promise<CalcomBooking> {
  const data = await calRequest('GET', `/bookings/${bookingId}`);
  return mapBooking(data?.booking ?? data);
}

/**
 * Check available slots for a given event type and date range.
 */
export async function getAvailableSlots(
  eventTypeId: number,
  startTime: string,
  endTime: string,
  timeZone?: string
): Promise<{ date: string; slots: string[] }[]> {
  const data = await calRequest('GET', '/slots/available', undefined, {
    eventTypeId,
    startTime,
    endTime,
    timeZone: timeZone || 'UTC',
  });

  const slots: Record<string, any[]> = data?.slots ?? {};
  return Object.entries(slots).map(([date, daySlots]) => ({
    date,
    slots: daySlots.map((s: any) => s.time ?? s),
  }));
}

/**
 * Create a new booking.
 */
export async function createBooking(
  eventTypeId: number,
  start: string,
  attendeeName: string,
  attendeeEmail: string,
  timeZone: string = 'UTC',
  notes?: string
): Promise<CalcomBooking> {
  const body: any = {
    eventTypeId,
    start,
    responses: {
      name: attendeeName,
      email: attendeeEmail,
      notes: notes || '',
    },
    timeZone,
    language: 'en',
    metadata: {},
  };

  const data = await calRequest('POST', '/bookings', body);
  logger.info(`Created Cal.com booking: ${data?.uid ?? data?.id}`);
  return mapBooking(data?.booking ?? data);
}

/**
 * Cancel a booking by ID.
 */
export async function cancelBooking(bookingId: number, reason?: string): Promise<void> {
  await calRequest('DELETE', `/bookings/${bookingId}`, reason ? { reason } : undefined);
  logger.info(`Cancelled Cal.com booking: ${bookingId}`);
}

/**
 * Reschedule an existing booking to a new start time.
 */
export async function rescheduleBooking(
  bookingId: number,
  newStart: string,
  reason?: string
): Promise<CalcomBooking> {
  const body: any = { start: newStart };
  if (reason) body.rescheduleReason = reason;

  const data = await calRequest('PATCH', `/bookings/${bookingId}`, body);
  logger.info(`Rescheduled Cal.com booking: ${bookingId}`);
  return mapBooking(data?.booking ?? data);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapBooking(b: any): CalcomBooking {
  return {
    id: b.id,
    uid: b.uid,
    title: b.title ?? b.eventType?.title ?? '(No title)',
    description: b.description,
    startTime: b.startTime,
    endTime: b.endTime,
    status: b.status,
    attendees: b.attendees ?? [],
    location: b.location,
    eventType: b.eventType,
  };
}
