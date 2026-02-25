/**
 * Web Message Processor
 *
 * Processes messages from the web interface using user-configured LLM providers.
 * Supports a full tool-call loop so the agent can use calendar tools.
 */

import { createModuleLogger } from '../../utils/logger.js';
import { addMessage, getSessionHistory, ensureWebSession } from '../../memory/database.js';
import type { AgentContext, AgentResponse } from '../../agents/agent.js';
import { getActiveLLMClient } from './llm/client-factory.js';
import type { LLMMessage } from './llm/types.js';
import { CALENDAR_TOOLS, executeCalendarTool, isCalendarTool } from '../../tools/calendar/calendar-tools.js';
import { retrieve, buildContextString, shouldUseRAG } from '../../rag/index.js';

const logger = createModuleLogger('web-processor');

const SYSTEM_PROMPT = `You are mybot, a helpful AI assistant with access to:
- Google Calendar tools (for scheduling and availability)
- A semantic search index that may contain uploaded documents or past content.

When the user asks about:
- Calendar, scheduling, availability, or appointments → use the appropriate calendar tool.
- Topics that might relate to uploaded or indexed content → FIRST try using the semantic search context you are given (if any) before answering.

Always answer helpfully and concisely, and clearly separate what comes from calendar tools vs. what comes from document/context search when relevant.`;

/**
 * Process a web message using the active LLM provider.
 * Runs a tool-call loop so the model can chain multiple tool calls.
 */
export async function processWebMessage(
  userMessage: string,
  context: AgentContext
): Promise<AgentResponse> {
  logger.info(`Processing web message for session: ${context.sessionId}`);

  // Ensure the session row exists (web sessions are not pre-created via getOrCreateSession)
  ensureWebSession(context.sessionId);

  // Persist user message
  addMessage(context.sessionId, 'user', userMessage);

  // Optional RAG context from uploaded / indexed content
  let ragContext = '';
  let ragUsed = false;
  let sourcesCount = 0;

  if (shouldUseRAG(userMessage)) {
    logger.info('RAG triggered for web query');
    try {
      const results = await retrieve(userMessage, {
        limit: 10,
        minScore: 0.4,
      });

      if (results.results.length > 0) {
        ragContext = buildContextString(results.results);
        ragUsed = true;
        sourcesCount = results.results.length;
        logger.info(`RAG found ${sourcesCount} relevant documents for web query`);
      }
    } catch (error: any) {
      logger.error(`Web RAG retrieval failed: ${error.message}`);
    }
  }

  // Get the configured LLM provider
  const llmProvider = await getActiveLLMClient();

  // Build the messages array from history
  const history = getSessionHistory(context.sessionId);
  const messages: LLMMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }];

  // Provide current server date/time so the LLM can answer date questions reliably
  messages.push({
    role: 'system',
    content: `Current server date/time is ${new Date().toISOString()} (ISO 8601).`,
  });

  // Add RAG context if available
  if (ragContext) {
    messages.push({
      role: 'system',
      content: `The following context from uploaded or indexed documents may be relevant to the user's question:\n\n${ragContext}`,
    });
  }

  // Provide current server date/time so the LLM can answer date questions reliably
  messages.push({
    role: 'system',
    content: `Current server date/time is ${new Date().toISOString()} (ISO 8601).`,
  });

  for (const msg of history.slice(-20)) {
    messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
  }

  // Initial LLM call with calendar tools
  logger.info(`Calling LLM with ${messages.length} messages and ${CALENDAR_TOOLS.length} tools`);
  let response = await llmProvider.chatCompletion(messages, CALENDAR_TOOLS, { maxTokens: 4096 });

  // Tool call loop — keep looping while the model wants to call tools
  let iterations = 0;
  const MAX_ITERATIONS = 10;

  while (response.tool_calls && response.tool_calls.length > 0 && iterations < MAX_ITERATIONS) {
    iterations++;
    logger.info(`Tool call iteration ${iterations}: ${response.tool_calls.map(tc => tc.function.name).join(', ')}`);

    // Add the assistant's tool-calling response to the conversation
    // (tool_calls is needed by providers like Anthropic to reconstruct tool_use blocks)
    messages.push({
      role: 'assistant',
      content: response.content ?? null,
      tool_calls: response.tool_calls,
    });

    // Execute each tool call and add results
    for (const toolCall of response.tool_calls) {
      let result: string;

      try {
        const args = JSON.parse(toolCall.function.arguments);

        if (isCalendarTool(toolCall.function.name)) {
          result = await executeCalendarTool(toolCall.function.name, args);
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

    // Call the LLM again with the tool results
    response = await llmProvider.chatCompletion(messages, CALENDAR_TOOLS, { maxTokens: 4096 });
  }

  const content = response.content || 'I was unable to generate a response. Please try again.';

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
