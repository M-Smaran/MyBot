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
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from '../../config/index.js';
import { createModuleLogger } from '../../utils/logger.js';
import settingsRoutes from './routes/settings.js';
import authRoutes from './routes/auth.js';
import { processWebMessage } from './web-adapter.js';
import { getSessionHistory, getWebSessions } from '../../memory/database.js';
import { hasActiveLLMProvider } from './llm/client-factory.js';
import { createEmbeddings, preprocessText, addDocuments, type Document, type DocumentMetadata } from '../../rag/index.js';

/**
 * Split text into overlapping chunks for better RAG retrieval.
 * Each chunk gets its own embedding so specific queries can match
 * the relevant part of a large document.
 */
function chunkText(text: string, chunkWords = 400, overlapWords = 50): string[] {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length <= chunkWords) return [text];

  const chunks: string[] = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + chunkWords, words.length);
    const chunk = words.slice(start, end).join(' ');
    if (chunk.length >= 20) chunks.push(chunk);
    if (end >= words.length) break;
    start += chunkWords - overlapWords;
  }
  return chunks.length > 0 ? chunks : [text];
}

const logger = createModuleLogger('web-server');

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

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

    // Split into chunks so specific queries can match relevant sections
    const chunks = chunkText(text);
    logger.info(`Splitting "${file.originalname}" into ${chunks.length} chunk(s) for indexing`);

    // Batch-embed all chunks in one API call
    const embeddings = await createEmbeddings(chunks);
    const nowIso = new Date().toISOString();

    const docs: Document[] = chunks.map((chunk, i) => {
      const metadata: DocumentMetadata = {
        channelId: 'uploads',
        channelName: 'uploads',
        userId: 'upload',
        userName: file.originalname,
        timestamp: nowIso,
        messageTs: `${file.filename}-chunk-${i}`,
        indexedAt: nowIso,
      };
      return {
        id: `upload:${file.filename}:${i}`,
        text: chunk,
        embedding: embeddings[i],
        metadata,
      };
    });

    await addDocuments(docs);

    return res.json({
      success: true,
      fileName: file.originalname,
      size: file.size,
      chunks: chunks.length,
    });
  } catch (error: any) {
    logger.error('File upload failed', { error: error.message });
    return res.status(500).json({ error: 'Failed to process uploaded document' });
  }
});

// List all web sessions
app.get('/api/sessions', (_req, res) => {
  try {
    res.json({ sessions: getWebSessions() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Chat history endpoint
app.get('/api/history/:sessionId', (req, res) => {
  try {
    const messages = getSessionHistory(req.params.sessionId, 100);
    res.json({ messages });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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

// Serve built frontend in production
const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendDist = join(__dirname, '../../../web-frontend/dist');
if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  // SPA fallback — all non-API routes serve index.html
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(join(frontendDist, 'index.html'));
    }
  });
  logger.info('Serving built frontend from ' + frontendDist);
}

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
          // Stream tokens to client as they arrive
          const onChunk = (chunk: string) => {
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({ type: 'stream_chunk', content: chunk }));
            }
          };

          const { response, sessionId: newSessionId } = await processWebMessage(
            message.content,
            sessionId || message.sessionId,
            onChunk
          );

          // Update session ID
          sessionId = newSessionId;

          // Send final message_end with metadata (content already streamed)
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
