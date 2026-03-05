/**
 * Web Channel Adapter
 *
 * Converts WebSocket messages to AgentContext and routes to the web message processor.
 */

import type { AgentContext, AgentResponse } from '../../agents/agent.js';
import { processWebMessage as processWebMsg } from './web-message-processor.js';
import { createModuleLogger } from '../../utils/logger.js';

const logger = createModuleLogger('web-adapter');

export interface WebMessage {
  type: 'message' | 'error' | 'status';
  content?: string;
  sessionId?: string;
  metadata?: {
    ragUsed?: boolean;
    sourcesCount?: number;
    memoryUsed?: boolean;
    memoriesCount?: number;
  };
}

/**
 * Process a message from the web interface.
 *
 * @param userMessage - The message from the user
 * @param sessionId - Optional session ID (generated if not provided)
 * @returns Agent response
 */
export async function processWebMessage(
  userMessage: string,
  sessionId?: string,
  onChunk?: (chunk: string) => void
): Promise<{ response: AgentResponse; sessionId: string }> {
  // Generate session ID if not provided
  const webSessionId = sessionId || `web:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;

  // Create agent context for web
  const context: AgentContext = {
    sessionId: webSessionId,
    userId: 'web_user', // No auth, single user
    channelId: 'web',
    threadTs: null,
    channelName: 'Web Interface',
    userName: 'User',
  };

  logger.info(`Processing web message in session: ${webSessionId}`);

  try {
    const response = await processWebMsg(userMessage, context, onChunk);

    return {
      response,
      sessionId: webSessionId,
    };
  } catch (error: any) {
    logger.error(`Failed to process web message: ${error.message}`);
    throw error;
  }
}
