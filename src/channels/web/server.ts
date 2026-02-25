/**
 * Web Server
 *
 * Express + WebSocket server for the web interface.
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import multer from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { config } from '../../config/index.js';
import { createModuleLogger } from '../../utils/logger.js';
import settingsRoutes from './routes/settings.js';
import authRoutes from './routes/auth.js';
import { processWebMessage } from './web-adapter.js';
import { hasActiveLLMProvider } from './llm/client-factory.js';
import { createEmbedding, preprocessText, addDocuments, type Document, type DocumentMetadata } from '../../rag/index.js';

const logger = createModuleLogger('web-server');

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

// Ensure uploads directory exists
const uploadsDir = join(process.cwd(), 'data', 'uploads');
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}

// File upload middleware (stores files on disk)
const upload = multer({ dest: uploadsDir });

// Middleware
app.use(cors({
  origin: config.web.corsOrigins,
  credentials: true,
}));
app.use(express.json());

// Document upload endpoint for RAG
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Read file contents as UTF-8 text
    const { readFile } = await import('fs/promises');
    const rawText = await readFile(file.path, 'utf-8');
    const text = preprocessText(rawText);

    if (!text || text.length < 20) {
      return res.status(400).json({ error: 'File does not contain enough text to index' });
    }

    // Create embedding and store as a RAG document
    const embedding = await createEmbedding(text);
    const nowIso = new Date().toISOString();

    const metadata: DocumentMetadata = {
      channelId: 'uploads',
      channelName: 'uploads',
      userId: 'upload',
      userName: 'Uploaded Document',
      timestamp: nowIso,
      messageTs: file.filename,
      indexedAt: nowIso,
    };

    const doc: Document = {
      id: `upload:${file.filename}`,
      text,
      embedding,
      metadata,
    };

    await addDocuments([doc]);

    return res.json({
      success: true,
      fileName: file.originalname,
      size: file.size,
    });
  } catch (error: any) {
    logger.error('File upload failed', { error: error.message });
    return res.status(500).json({ error: 'Failed to process uploaded document' });
  }
});

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
app.use('/api/auth', authRoutes);

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
    const { initializeGoogleCalendar, initializeGoogleCalendarOAuth } = await import('../../tools/calendar/google-calendar.js');
    const { initializeCalcom } = await import('../../tools/calendar/calcom-client.js');

    const cred = getCalendarCredential('google');
    if (cred) {
      const json = decryptAPIKey(cred.encryptedCredentials, cred.encryptionIv);
      if (cred.authType === 'oauth') {
        const tokens = JSON.parse(json);
        initializeGoogleCalendarOAuth(
          tokens.access_token,
          tokens.refresh_token,
          tokens.client_id,
          tokens.client_secret
        );
        logger.info(`Google Calendar (OAuth) loaded from database for ${cred.oauthEmail}`);
      } else {
        await initializeGoogleCalendar(json);
        logger.info('Google Calendar (service account) credentials loaded from database');
      }
    }

    const calcomCred = getCalendarCredential('calcom');
    if (calcomCred) {
      const key = decryptAPIKey(calcomCred.encryptedCredentials, calcomCred.encryptionIv);
      initializeCalcom(key);
      logger.info('Cal.com client loaded from database');
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
