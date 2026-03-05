/**
 * Web Message Processor
 *
 * Processes messages from the web interface using user-configured LLM providers.
 * Supports a full tool-call loop so the agent can use calendar and Cal.com tools.
 */

import { createModuleLogger } from '../../utils/logger.js';
import { addMessage, getSessionHistory, ensureWebSession } from '../../memory/database.js';
import type { AgentContext, AgentResponse } from '../../agents/agent.js';
import { getActiveLLMClient } from './llm/client-factory.js';
import type { LLMMessage } from './llm/types.js';
import { CALENDAR_TOOLS, executeCalendarTool, isCalendarTool } from '../../tools/calendar/calendar-tools.js';
import { CALCOM_TOOLS, executeCalcomTool, isCalcomTool } from '../../tools/calendar/calcom-tools.js';
import { retrieve, buildContextString } from '../../rag/index.js';

const logger = createModuleLogger('web-processor');

// Combine all available tools into a single array passed to the LLM
const ALL_TOOLS = [...CALENDAR_TOOLS, ...CALCOM_TOOLS];

const SYSTEM_PROMPT = `You are mybot, a helpful AI assistant with access to:
- Cal.com tools (default calendar — for all scheduling, availability, bookings, event types, and appointments)
- Google Calendar tools (only use if the user explicitly mentions "Google Calendar")
- A document knowledge base (uploaded files that have been indexed for semantic search)

When the user asks about:
- Scheduling, availability, appointments, bookings, or meetings → use the calcom_ tools by default. ALWAYS call calcom_list_event_types first to get a valid eventTypeId before calling calcom_check_availability or calcom_create_booking.
- If the user wants to BOOK an appointment and any required details are missing, ask BEFORE calling any tool. Required: (1) attendee full name, (2) preferred date and time, (3) meeting type or duration. Email is NOT required — the Cal.com account email is used automatically. Timezone defaults to CET (Europe/Berlin) — only ask if the user mentions a different timezone. Example prompt: "To book your appointment, please provide: your full name, preferred date & time, and the meeting type (e.g. 30-minute call)."
- Google Calendar specifically → use the google calendar tools only when the user explicitly says "Google Calendar".
- Anything about uploaded documents, files, or knowledge base content → look for a system message labeled "Relevant Document Context" and answer DIRECTLY from that content. Do NOT say you cannot access documents — the content is already provided to you in the context.

Always answer helpfully and concisely.`;

/**
 * Process a web message using the active LLM provider.
 * Runs a tool-call loop so the model can chain multiple tool calls.
 * onChunk is called for each streamed token in the final response.
 */
export async function processWebMessage(
  userMessage: string,
  context: AgentContext,
  onChunk?: (chunk: string) => void
): Promise<AgentResponse> {
  logger.info(`Processing web message for session: ${context.sessionId}`);

  // Ensure the session row exists
  ensureWebSession(context.sessionId);

  // Persist user message
  addMessage(context.sessionId, 'user', userMessage);

  // Run RAG retrieval and LLM client init in parallel
  const [ragResult, llmProvider] = await Promise.all([
    retrieve(userMessage, { limit: 5, minScore: 0.25 }).catch((err: any) => {
      logger.warn(`Web RAG retrieval skipped: ${err.message}`);
      return { results: [] };
    }),
    getActiveLLMClient(),
  ]);

  let ragContext = '';
  let ragUsed = false;
  let sourcesCount = 0;

  if (ragResult.results.length > 0) {
    ragContext = buildContextString(ragResult.results);
    ragUsed = true;
    sourcesCount = ragResult.results.length;
    logger.info(`RAG found ${sourcesCount} relevant documents for web query`);
  }

  // Build the messages array from history (last 10 messages)
  const history = getSessionHistory(context.sessionId);
  const messages: LLMMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }];

  messages.push({
    role: 'system',
    content: `Current server date/time is ${new Date().toISOString()} (ISO 8601).`,
  });

  if (ragContext) {
    messages.push({
      role: 'system',
      content: `## Relevant Document Context\n\nThe following content was retrieved from your indexed documents and is directly relevant to the user's question. Answer using this content:\n\n${ragContext}`,
    });
  }

  for (const msg of history.slice(-10)) {
    messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
  }

  // Tool call loop with regular (non-streaming) completions
  logger.info(`Calling LLM with ${messages.length} messages and ${ALL_TOOLS.length} tools`);
  let response = await llmProvider.chatCompletion(messages, ALL_TOOLS, { maxTokens: 1500 });

  let iterations = 0;
  const MAX_ITERATIONS = 10;

  while (response.tool_calls && response.tool_calls.length > 0 && iterations < MAX_ITERATIONS) {
    iterations++;
    logger.info(`Tool call iteration ${iterations}: ${response.tool_calls.map(tc => tc.function.name).join(', ')}`);

    messages.push({
      role: 'assistant',
      content: response.content ?? null,
      tool_calls: response.tool_calls,
    });

    for (const toolCall of response.tool_calls) {
      let result: string;

      try {
        const args = JSON.parse(toolCall.function.arguments);

        if (isCalendarTool(toolCall.function.name)) {
          result = await executeCalendarTool(toolCall.function.name, args);
        } else if (isCalcomTool(toolCall.function.name)) {
          result = await executeCalcomTool(toolCall.function.name, args);
        } else {
          result = `Unknown tool: ${toolCall.function.name}`;
        }
      } catch (error: any) {
        result = `Error executing tool ${toolCall.function.name}: ${error.message}`;
        logger.error(`Tool execution failed: ${error.message}`);
      }

      logger.info(`Tool ${toolCall.function.name} result: ${result.substring(0, 100)}...`);

      messages.push({
        role: 'tool',
        content: result,
        tool_call_id: toolCall.id,
      });
    }

    response = await llmProvider.chatCompletion(messages, ALL_TOOLS, { maxTokens: 1500 });
  }

  let content: string;

  // Use streaming for the final text response if supported and a callback is provided
  if (onChunk && llmProvider.streamChatCompletion) {
    logger.info('Streaming final response');
    content = await llmProvider.streamChatCompletion(messages, { maxTokens: 1500 }, onChunk);
    if (!content) content = 'I was unable to generate a response. Please try again.';
  } else {
    content = response.content || 'I was unable to generate a response. Please try again.';
  }

  // Persist assistant reply
  addMessage(context.sessionId, 'assistant', content);

  return {
    content,
    shouldThread: false,
    ragUsed,
    sourcesCount,
    memoryUsed: false,
    memoriesCount: 0,
  };
}
