/**
 * Calendar Tool Definitions and Executor
 *
 * Defines the LLM tool schemas and the execution logic for all calendar tools.
 * These are used by the web message processor's tool call loop.
 */

import type { LLMTool } from '../../channels/web/llm/types.js';
import { createModuleLogger } from '../../utils/logger.js';
import {
  listCalendars,
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  checkFreeBusy,
  isCalendarInitialized,
} from './google-calendar.js';

const logger = createModuleLogger('calendar-tools');

// ============================================
// Tool Definitions (LLM Schema)
// ============================================

export const CALENDAR_TOOLS: LLMTool[] = [
  {
    type: 'function',
    function: {
      name: 'list_calendars',
      description: 'List all Google Calendars the assistant has access to. Use this to find calendar IDs before working with specific calendars.',
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
      name: 'get_calendar_events',
      description: 'Retrieve events from a Google Calendar within a date range. Use this to see what is scheduled, check appointments, or look up the calendar.',
      parameters: {
        type: 'object',
        properties: {
          calendar_id: {
            type: 'string',
            description: 'The calendar ID to fetch events from. Use "primary" for the main calendar.',
          },
          time_min: {
            type: 'string',
            description: 'Start of the time range in ISO 8601 format (e.g. "2024-01-15T00:00:00Z"). Defaults to now.',
          },
          time_max: {
            type: 'string',
            description: 'End of the time range in ISO 8601 format (e.g. "2024-01-22T23:59:59Z"). Defaults to 7 days from now.',
          },
          max_results: {
            type: 'number',
            description: 'Maximum number of events to return (1-50). Defaults to 20.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_availability',
      description: 'Check whether a person or calendar is free or busy during a specific time window. Returns busy time slots so you can find a suitable meeting time.',
      parameters: {
        type: 'object',
        properties: {
          calendar_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of calendar IDs to check. Use ["primary"] for the main calendar.',
          },
          time_min: {
            type: 'string',
            description: 'Start of the window to check, in ISO 8601 format.',
          },
          time_max: {
            type: 'string',
            description: 'End of the window to check, in ISO 8601 format.',
          },
        },
        required: ['calendar_ids', 'time_min', 'time_max'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'book_appointment',
      description: 'Create / book a new appointment or event on the Google Calendar. Use this to schedule meetings, reminders, or any calendar event.',
      parameters: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: 'Title / name of the appointment (e.g. "Team Standup", "Doctor Visit").',
          },
          description: {
            type: 'string',
            description: 'Optional detailed description or agenda for the event.',
          },
          location: {
            type: 'string',
            description: 'Optional location of the event (address or meeting room).',
          },
          start_datetime: {
            type: 'string',
            description: 'Start date and time in ISO 8601 format (e.g. "2024-01-15T09:00:00").',
          },
          end_datetime: {
            type: 'string',
            description: 'End date and time in ISO 8601 format (e.g. "2024-01-15T10:00:00").',
          },
          time_zone: {
            type: 'string',
            description: 'IANA time zone name (e.g. "America/New_York", "Europe/London", "Asia/Kolkata"). Defaults to UTC.',
          },
          calendar_id: {
            type: 'string',
            description: 'Calendar ID to create the event in. Defaults to "primary".',
          },
          attendee_emails: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional list of attendee email addresses to invite.',
          },
          send_notifications: {
            type: 'boolean',
            description: 'Whether to send email invitations to attendees. Defaults to true.',
          },
        },
        required: ['summary', 'start_datetime', 'end_datetime'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_appointment',
      description: 'Update / reschedule an existing calendar event. You can change the title, time, attendees, or any other field.',
      parameters: {
        type: 'object',
        properties: {
          event_id: {
            type: 'string',
            description: 'The ID of the event to update. Get this from get_calendar_events.',
          },
          calendar_id: {
            type: 'string',
            description: 'Calendar ID containing the event. Defaults to "primary".',
          },
          summary: {
            type: 'string',
            description: 'New title for the event.',
          },
          description: {
            type: 'string',
            description: 'New description for the event.',
          },
          location: {
            type: 'string',
            description: 'New location for the event.',
          },
          start_datetime: {
            type: 'string',
            description: 'New start date and time in ISO 8601 format.',
          },
          end_datetime: {
            type: 'string',
            description: 'New end date and time in ISO 8601 format.',
          },
          time_zone: {
            type: 'string',
            description: 'IANA time zone name for the new times.',
          },
          attendee_emails: {
            type: 'array',
            items: { type: 'string' },
            description: 'New complete list of attendee emails (replaces existing list).',
          },
        },
        required: ['event_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_appointment',
      description: 'Cancel / delete an existing calendar event. This will remove the event from the calendar and optionally notify attendees.',
      parameters: {
        type: 'object',
        properties: {
          event_id: {
            type: 'string',
            description: 'The ID of the event to cancel. Get this from get_calendar_events.',
          },
          calendar_id: {
            type: 'string',
            description: 'Calendar ID containing the event. Defaults to "primary".',
          },
          send_notifications: {
            type: 'boolean',
            description: 'Whether to send cancellation emails to attendees. Defaults to true.',
          },
        },
        required: ['event_id'],
      },
    },
  },
];

// ============================================
// Tool Executor
// ============================================

/**
 * Execute a calendar tool call and return the result as a string.
 */
export async function executeCalendarTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  if (!isCalendarInitialized()) {
    return 'Google Calendar is not configured. Please go to Settings and add your Google service account credentials.';
  }

  logger.info(`Executing calendar tool: ${name}`, { args });

  try {
    switch (name) {
      case 'list_calendars': {
        const calendars = await listCalendars();
        if (calendars.length === 0) {
          return 'No calendars found. Make sure the service account has been shared access to the calendar.';
        }
        const lines = calendars.map(c =>
          `• ${c.summary}${c.primary ? ' (Primary)' : ''}\n  ID: ${c.id}${c.timeZone ? `\n  Timezone: ${c.timeZone}` : ''}`
        );
        return `Found ${calendars.length} calendar(s):\n\n${lines.join('\n\n')}`;
      }

      case 'get_calendar_events': {
        const calendarId = (args.calendar_id as string) || 'primary';
        const timeMin = args.time_min as string | undefined;
        const timeMax = args.time_max as string | undefined;
        const maxResults = Math.min((args.max_results as number) || 20, 50);

        const events = await listEvents(calendarId, timeMin, timeMax, maxResults);
        if (events.length === 0) {
          return 'No events found in the specified time range.';
        }

        const lines = events.map(e => {
          const start = e.start.dateTime
            ? new Date(e.start.dateTime).toLocaleString()
            : e.start.date || 'Unknown';
          const end = e.end.dateTime
            ? new Date(e.end.dateTime).toLocaleString()
            : e.end.date || 'Unknown';
          const attendees = e.attendees?.map(a => a.email).join(', ');
          let line = `• ${e.summary}\n  ID: ${e.id}\n  Start: ${start}\n  End: ${end}`;
          if (e.location) line += `\n  Location: ${e.location}`;
          if (attendees) line += `\n  Attendees: ${attendees}`;
          if (e.description) line += `\n  Description: ${e.description.substring(0, 100)}${e.description.length > 100 ? '...' : ''}`;
          return line;
        });

        return `Found ${events.length} event(s):\n\n${lines.join('\n\n')}`;
      }

      case 'check_availability': {
        const calendarIds = args.calendar_ids as string[];
        const timeMin = args.time_min as string;
        const timeMax = args.time_max as string;

        const results = await checkFreeBusy(calendarIds, timeMin, timeMax);
        const lines = results.map(r => {
          if (r.busySlots.length === 0) {
            return `${r.calendar}: FREE (no busy slots)`;
          }
          const slots = r.busySlots.map(s =>
            `  - ${new Date(s.start).toLocaleString()} → ${new Date(s.end).toLocaleString()}`
          ).join('\n');
          return `${r.calendar}: BUSY during:\n${slots}`;
        });

        return `Availability check:\n\n${lines.join('\n\n')}`;
      }

      case 'book_appointment': {
        const event = await createEvent({
          summary: args.summary as string,
          description: args.description as string | undefined,
          location: args.location as string | undefined,
          startDateTime: args.start_datetime as string,
          endDateTime: args.end_datetime as string,
          timeZone: (args.time_zone as string) || 'UTC',
          calendarId: (args.calendar_id as string) || 'primary',
          attendeeEmails: args.attendee_emails as string[] | undefined,
          sendNotifications: args.send_notifications !== false,
        });

        const start = event.start.dateTime
          ? new Date(event.start.dateTime).toLocaleString()
          : event.start.date || 'Unknown';

        let result = `Successfully booked appointment!\n\n• Title: ${event.summary}\n• Start: ${start}\n• Event ID: ${event.id}`;
        if (event.htmlLink) result += `\n• Link: ${event.htmlLink}`;
        if (event.attendees && event.attendees.length > 0) {
          result += `\n• Invites sent to: ${event.attendees.map(a => a.email).join(', ')}`;
        }
        return result;
      }

      case 'update_appointment': {
        const event = await updateEvent({
          eventId: args.event_id as string,
          calendarId: (args.calendar_id as string) || 'primary',
          summary: args.summary as string | undefined,
          description: args.description as string | undefined,
          location: args.location as string | undefined,
          startDateTime: args.start_datetime as string | undefined,
          endDateTime: args.end_datetime as string | undefined,
          timeZone: args.time_zone as string | undefined,
          attendeeEmails: args.attendee_emails as string[] | undefined,
        });

        const start = event.start.dateTime
          ? new Date(event.start.dateTime).toLocaleString()
          : event.start.date || 'Unknown';

        return `Successfully updated appointment!\n\n• Title: ${event.summary}\n• Start: ${start}\n• Event ID: ${event.id}`;
      }

      case 'cancel_appointment': {
        const eventId = args.event_id as string;
        const calendarId = (args.calendar_id as string) || 'primary';
        const sendNotifications = args.send_notifications !== false;

        await deleteEvent(eventId, calendarId, sendNotifications);
        return `Successfully cancelled appointment (ID: ${eventId}).${sendNotifications ? ' Cancellation emails sent to attendees.' : ''}`;
      }

      default:
        return `Unknown calendar tool: ${name}`;
    }
  } catch (error: any) {
    logger.error(`Calendar tool ${name} failed: ${error.message}`);
    return `Calendar tool failed: ${error.message}`;
  }
}

/**
 * Returns true if the given tool name is a calendar tool.
 */
export function isCalendarTool(name: string): boolean {
  return CALENDAR_TOOLS.some(t => t.function.name === name);
}
