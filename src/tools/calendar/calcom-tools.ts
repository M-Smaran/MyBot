/**
 * Cal.com Tool Definitions
 *
 * LLM-facing tools for Cal.com scheduling operations.
 */

import type { LLMTool } from '../../channels/web/llm/types.js';
import { createModuleLogger } from '../../utils/logger.js';
import {
  listEventTypes,
  listBookings,
  getAvailableSlots,
  createBooking,
  cancelBooking,
  rescheduleBooking,
} from './calcom-client.js';

const logger = createModuleLogger('calcom-tools');

// ── Tool name constants ───────────────────────────────────────────────────────

const TOOL_NAMES = [
  'calcom_list_event_types',
  'calcom_list_bookings',
  'calcom_check_availability',
  'calcom_create_booking',
  'calcom_cancel_booking',
  'calcom_reschedule_booking',
] as const;

type CalcomToolName = typeof TOOL_NAMES[number];

export function isCalcomTool(name: string): name is CalcomToolName {
  return TOOL_NAMES.includes(name as CalcomToolName);
}

// ── Tool definitions ──────────────────────────────────────────────────────────

export const CALCOM_TOOLS: LLMTool[] = [
  {
    type: 'function',
    function: {
      name: 'calcom_list_event_types',
      description: 'List all Cal.com event types (booking pages) available for scheduling. Returns IDs, titles, durations, and descriptions.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calcom_list_bookings',
      description: 'List bookings from Cal.com. Use status to filter by upcoming, past, or cancelled bookings.',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['upcoming', 'past', 'cancelled', 'recurring'],
            description: 'Filter bookings by status. Defaults to upcoming if omitted.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calcom_check_availability',
      description: 'Check available time slots for a Cal.com event type within a date range. Returns available slots grouped by date.',
      parameters: {
        type: 'object',
        properties: {
          eventTypeId: {
            type: 'number',
            description: 'The Cal.com event type ID to check availability for. Use calcom_list_event_types to find IDs.',
          },
          startTime: {
            type: 'string',
            description: 'Start of the date range in ISO 8601 format (e.g., 2025-03-01T00:00:00Z).',
          },
          endTime: {
            type: 'string',
            description: 'End of the date range in ISO 8601 format (e.g., 2025-03-07T23:59:59Z).',
          },
          timeZone: {
            type: 'string',
            description: 'IANA timezone (e.g., America/New_York). Defaults to UTC.',
          },
        },
        required: ['eventTypeId', 'startTime', 'endTime'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calcom_create_booking',
      description: 'Create a new booking on Cal.com for a specific event type and time slot.',
      parameters: {
        type: 'object',
        properties: {
          eventTypeId: {
            type: 'number',
            description: 'The Cal.com event type ID to book. Use calcom_list_event_types to find IDs.',
          },
          start: {
            type: 'string',
            description: 'Start time of the booking in ISO 8601 format (e.g., 2025-03-05T14:00:00Z).',
          },
          attendeeName: {
            type: 'string',
            description: 'Full name of the person booking the appointment.',
          },
          attendeeEmail: {
            type: 'string',
            description: 'Email address of the person booking the appointment.',
          },
          timeZone: {
            type: 'string',
            description: 'IANA timezone for the attendee (e.g., America/New_York). Defaults to UTC.',
          },
          notes: {
            type: 'string',
            description: 'Optional notes or reason for the booking.',
          },
        },
        required: ['eventTypeId', 'start', 'attendeeName', 'attendeeEmail'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calcom_cancel_booking',
      description: 'Cancel an existing Cal.com booking by its numeric ID.',
      parameters: {
        type: 'object',
        properties: {
          bookingId: {
            type: 'number',
            description: 'The numeric ID of the booking to cancel. Use calcom_list_bookings to find IDs.',
          },
          reason: {
            type: 'string',
            description: 'Optional reason for cancelling the booking.',
          },
        },
        required: ['bookingId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calcom_reschedule_booking',
      description: 'Reschedule an existing Cal.com booking to a new start time.',
      parameters: {
        type: 'object',
        properties: {
          bookingId: {
            type: 'number',
            description: 'The numeric ID of the booking to reschedule. Use calcom_list_bookings to find IDs.',
          },
          newStart: {
            type: 'string',
            description: 'New start time in ISO 8601 format (e.g., 2025-03-06T15:00:00Z).',
          },
          reason: {
            type: 'string',
            description: 'Optional reason for rescheduling.',
          },
        },
        required: ['bookingId', 'newStart'],
      },
    },
  },
];

// ── Executor ──────────────────────────────────────────────────────────────────

export async function executeCalcomTool(name: string, args: Record<string, any>): Promise<string> {
  logger.info(`Executing Cal.com tool: ${name}`);

  try {
    switch (name as CalcomToolName) {
      case 'calcom_list_event_types': {
        const types = await listEventTypes();
        if (types.length === 0) return 'No event types found on Cal.com.';
        return JSON.stringify(types.map(t => ({
          id: t.id,
          title: t.title,
          durationMinutes: t.length,
          description: t.description || null,
          slug: t.slug,
        })), null, 2);
      }

      case 'calcom_list_bookings': {
        const bookings = await listBookings(args.status);
        if (bookings.length === 0) return `No ${args.status || 'upcoming'} bookings found.`;
        return JSON.stringify(bookings.map(b => ({
          id: b.id,
          title: b.title,
          start: b.startTime,
          end: b.endTime,
          status: b.status,
          attendees: b.attendees.map(a => `${a.name} <${a.email}>`),
          location: b.location || null,
        })), null, 2);
      }

      case 'calcom_check_availability': {
        const slots = await getAvailableSlots(
          args.eventTypeId,
          args.startTime,
          args.endTime,
          args.timeZone
        );
        if (slots.length === 0 || slots.every(d => d.slots.length === 0)) {
          return 'No available slots found for that date range.';
        }
        return JSON.stringify(slots, null, 2);
      }

      case 'calcom_create_booking': {
        const booking = await createBooking(
          args.eventTypeId,
          args.start,
          args.attendeeName,
          args.attendeeEmail,
          args.timeZone || 'UTC',
          args.notes
        );
        return `Booking created successfully!\n${JSON.stringify({
          id: booking.id,
          uid: booking.uid,
          title: booking.title,
          start: booking.startTime,
          end: booking.endTime,
          status: booking.status,
        }, null, 2)}`;
      }

      case 'calcom_cancel_booking': {
        await cancelBooking(args.bookingId, args.reason);
        return `Booking ${args.bookingId} has been cancelled successfully.`;
      }

      case 'calcom_reschedule_booking': {
        const booking = await rescheduleBooking(args.bookingId, args.newStart, args.reason);
        return `Booking rescheduled successfully!\n${JSON.stringify({
          id: booking.id,
          title: booking.title,
          newStart: booking.startTime,
          newEnd: booking.endTime,
          status: booking.status,
        }, null, 2)}`;
      }

      default:
        return `Unknown Cal.com tool: ${name}`;
    }
  } catch (error: any) {
    logger.error(`Cal.com tool ${name} failed: ${error.message}`);
    return `Error: ${error.message}`;
  }
}
