/**
 * Web Server
 *
 * Express + WebSocket server for the web interface.
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import { config } from '../../config/index.js';
import { createModuleLogger } from '../../utils/logger.js';
import settingsRoutes from './routes/settings.js';
import { processWebMessage } from './web-adapter.js';
import { hasActiveLLMProvider } from './llm/client-factory.js';

const logger = createModuleLogger('web-server');

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

// Middleware
app.use(cors({
  origin: config.web.corsOrigins,
  credentials: true,
}));
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasActiveLLM: hasActiveLLMProvider(),
    timestamp: new Date().toISOString(),
  });
});

// Mount routes
app.use('/api/settings', settingsRoutes);

// WebSocket connection handler
wss.on('connection', (ws: WebSocket) => {
  logger.info('New WebSocket connection established');

  let sessionId: string | undefined;

  ws.on('message', async (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());
      logger.debug('Received WebSocket message', { type: message.type });

      if (message.type === 'chat') {
        // Check if LLM provider is configured
        if (!hasActiveLLMProvider()) {
          ws.send(JSON.stringify({
            type: 'error',
            content: 'No active LLM provider configured. Please add an API key in Settings.',
          }));
          return;
        }

        // Send typing indicator
        ws.send(JSON.stringify({
          type: 'status',
          content: 'typing',
        }));

        try {
          // Process the message
          const { response, sessionId: newSessionId } = await processWebMessage(
            message.content,
            sessionId || message.sessionId
          );

          // Update session ID
          sessionId = newSessionId;

          // Send response
          ws.send(JSON.stringify({
            type: 'message',
            content: response.content,
            sessionId,
            metadata: {
              ragUsed: response.ragUsed,
              sourcesCount: response.sourcesCount,
              memoryUsed: response.memoryUsed,
              memoriesCount: response.memoriesCount,
            },
          }));
        } catch (error: any) {
          logger.error('Error processing message', { error: error.message });
          ws.send(JSON.stringify({
            type: 'error',
            content: error.message || 'An error occurred while processing your message.',
          }));
        }
      } else if (message.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch (error: any) {
      logger.error('Error handling WebSocket message', { error: error.message });
      ws.send(JSON.stringify({
        type: 'error',
        content: 'Invalid message format',
      }));
    }
  });

  ws.on('close', () => {
    logger.info('WebSocket connection closed', { sessionId });
  });

  ws.on('error', (error) => {
    logger.error('WebSocket error', { error: error.message });
  });

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'status',
    content: 'connected',
  }));
});

/**
 * Start the web server.
 */
export async function startWebServer(): Promise<void> {
  // Bootstrap calendar credentials if they were saved from a previous session
  try {
    const { getCalendarCredential } = await import('../../memory/database.js');
    const { decryptAPIKey } = await import('./encryption.js');
    const { initializeGoogleCalendar } = await import('../../tools/calendar/google-calendar.js');

    const cred = getCalendarCredential('google');
    if (cred) {
      const json = decryptAPIKey(cred.encryptedCredentials, cred.encryptionIv);
      await initializeGoogleCalendar(json);
      logger.info('Google Calendar credentials loaded from database');
    }
  } catch (err: any) {
    logger.warn(`Could not load calendar credentials: ${err.message}`);
  }

  return new Promise((resolve, reject) => {
    try {
      httpServer.listen(config.web.port, () => {
        logger.info(`Web server listening on port ${config.web.port}`);
        logger.info(`WebSocket endpoint: ws://localhost:${config.web.port}`);
        logger.info(`HTTP API endpoint: http://localhost:${config.web.port}/api`);
        resolve();
      });

      httpServer.on('error', (error) => {
        logger.error('Failed to start web server', { error });
        reject(error);
      });
    } catch (error) {
      logger.error('Error starting web server', { error });
      reject(error);
    }
  });
}

/**
 * Stop the web server.
 */
export async function stopWebServer(): Promise<void> {
  return new Promise((resolve) => {
    wss.clients.forEach(client => client.close());
    wss.close(() => {
      httpServer.close(() => {
        logger.info('Web server stopped');
        resolve();
      });
    });
  });
}
