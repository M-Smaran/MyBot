import Database from 'better-sqlite3';
import { config } from '../config/index.js';
import { createModuleLogger } from '../utils/logger.js';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

const logger = createModuleLogger('database');

// Ensure data directory exists
const dbDir = dirname(config.app.databasePath);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

// Initialize database
const db = new Database(config.app.databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
function initSchema() {
  logger.info('Initializing database schema...');

  // Sessions table - tracks conversation sessions
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      channel_id TEXT,
      thread_ts TEXT,
      session_type TEXT NOT NULL DEFAULT 'dm',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      last_activity INTEGER NOT NULL DEFAULT (unixepoch()),
      metadata TEXT
    )
  `);

  // Messages table - stores conversation history
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      slack_ts TEXT,
      thread_ts TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      metadata TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  // Scheduled tasks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      thread_ts TEXT,
      task_description TEXT NOT NULL,
      cron_expression TEXT,
      scheduled_time INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      executed_at INTEGER,
      metadata TEXT
    )
  `);

  // Pairing codes for DM security
  db.exec(`
    CREATE TABLE IF NOT EXISTS pairing_codes (
      code TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      expires_at INTEGER NOT NULL,
      approved INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Approved users for DM access
  db.exec(`
    CREATE TABLE IF NOT EXISTS approved_users (
      user_id TEXT PRIMARY KEY,
      approved_at INTEGER NOT NULL DEFAULT (unixepoch()),
      approved_by TEXT
    )
  `);

  // API keys table (for web interface - global keys, no per-user)
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      encrypted_key TEXT NOT NULL,
      encryption_iv TEXT NOT NULL,
      name TEXT,
      is_active INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      last_used INTEGER,
      UNIQUE(provider, name)
    )
  `);

  // Calendar credentials table (stores encrypted Google service account JSON or OAuth tokens)
  db.exec(`
    CREATE TABLE IF NOT EXISTS calendar_credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL DEFAULT 'google',
      auth_type TEXT NOT NULL DEFAULT 'service_account',
      encrypted_credentials TEXT NOT NULL,
      encryption_iv TEXT NOT NULL,
      label TEXT,
      oauth_email TEXT,
      is_active INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  // Create indexes for performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_channel ON sessions(channel_id);
    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_status ON scheduled_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_pairing_codes_user ON pairing_codes(user_id);
    CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);
  `);

  logger.info('Database schema initialized');
}

initSchema();

/**
 * Initialize the database.
 * Called at startup to ensure schema is ready.
 * Safe to call multiple times.
 */
export function initializeDatabase(): void {
  // Schema is initialized automatically when this module is imported.
  // This function exists for explicit initialization in the main entry point.
  logger.info('Database ready');
}

// ============================================
// Session Management
// ============================================

export interface Session {
  id: string;
  userId: string;
  channelId: string | null;
  threadTs: string | null;
  sessionType: 'dm' | 'channel' | 'thread';
  createdAt: number;
  lastActivity: number;
  metadata: Record<string, unknown> | null;
}

export function getOrCreateSession(
  userId: string,
  channelId: string | null,
  threadTs: string | null
): Session {
  // Generate session ID based on context
  let sessionId: string;
  let sessionType: 'dm' | 'channel' | 'thread';

  if (threadTs) {
    sessionId = `thread:${channelId}:${threadTs}`;
    sessionType = 'thread';
  } else if (channelId && !channelId.startsWith('D')) {
    sessionId = `channel:${channelId}`;
    sessionType = 'channel';
  } else {
    sessionId = `dm:${userId}`;
    sessionType = 'dm';
  }

  // Check if session exists
  const existing = db.prepare(`
    SELECT * FROM sessions WHERE id = ?
  `).get(sessionId) as Session | undefined;

  if (existing) {
    // Update last activity
    db.prepare(`
      UPDATE sessions SET last_activity = unixepoch() WHERE id = ?
    `).run(sessionId);

    return {
      ...existing,
      metadata: existing.metadata ? JSON.parse(existing.metadata as unknown as string) : null,
    };
  }

  // Create new session
  db.prepare(`
    INSERT INTO sessions (id, user_id, channel_id, thread_ts, session_type)
    VALUES (?, ?, ?, ?, ?)
  `).run(sessionId, userId, channelId, threadTs, sessionType);

  return {
    id: sessionId,
    userId,
    channelId,
    threadTs,
    sessionType,
    createdAt: Math.floor(Date.now() / 1000),
    lastActivity: Math.floor(Date.now() / 1000),
    metadata: null,
  };
}

/**
 * Ensure a web session row exists for the given sessionId.
 * Web sessions use the pre-generated ID format `web:<ts>:<rand>`.
 */
export function ensureWebSession(sessionId: string): void {
  const existing = db.prepare(`SELECT id FROM sessions WHERE id = ?`).get(sessionId);
  if (existing) {
    db.prepare(`UPDATE sessions SET last_activity = unixepoch() WHERE id = ?`).run(sessionId);
  } else {
    db.prepare(`
      INSERT INTO sessions (id, user_id, channel_id, thread_ts, session_type)
      VALUES (?, ?, NULL, NULL, 'web')
    `).run(sessionId, sessionId);
  }
}

export interface SessionSummary {
  id: string;
  title: string;
  lastActivity: number;
  messageCount: number;
}

export function getWebSessions(): SessionSummary[] {
  const rows = db.prepare(`
    SELECT
      s.id,
      s.last_activity AS lastActivity,
      COUNT(m.id) AS messageCount,
      MIN(CASE WHEN m.role = 'user' THEN m.content END) AS firstUserMessage
    FROM sessions s
    LEFT JOIN messages m ON m.session_id = s.id
    WHERE s.session_type = 'web' OR (s.channel_id IS NULL AND s.user_id = s.id)
    GROUP BY s.id
    HAVING messageCount > 0
    ORDER BY s.last_activity DESC
    LIMIT 50
  `).all() as any[];

  return rows.map(r => ({
    id: r.id,
    title: r.firstUserMessage
      ? (r.firstUserMessage as string).slice(0, 50)
      : 'New chat',
    lastActivity: r.lastActivity,
    messageCount: r.messageCount,
  }));
}

export function getSession(sessionId: string): Session | null {
  const session = db.prepare(`
    SELECT * FROM sessions WHERE id = ?
  `).get(sessionId) as Session | undefined;

  if (!session) return null;

  return {
    ...session,
    metadata: session.metadata ? JSON.parse(session.metadata as unknown as string) : null,
  };
}

// ============================================
// Message History
// ============================================

export interface Message {
  id: number;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  slackTs: string | null;
  threadTs: string | null;
  createdAt: number;
  metadata: Record<string, unknown> | null;
}

export function addMessage(
  sessionId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  slackTs?: string,
  threadTs?: string,
  metadata?: Record<string, unknown>
): Message {
  const result = db.prepare(`
    INSERT INTO messages (session_id, role, content, slack_ts, thread_ts, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    sessionId,
    role,
    content,
    slackTs || null,
    threadTs || null,
    metadata ? JSON.stringify(metadata) : null
  );

  return {
    id: Number(result.lastInsertRowid),
    sessionId,
    role,
    content,
    slackTs: slackTs || null,
    threadTs: threadTs || null,
    createdAt: Math.floor(Date.now() / 1000),
    metadata: metadata || null,
  };
}

export function getSessionHistory(
  sessionId: string,
  limit: number = config.app.maxHistoryMessages
): Message[] {
  const messages = db.prepare(`
    SELECT * FROM messages
    WHERE session_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(sessionId, limit) as Message[];

  return messages.reverse().map((msg) => ({
    ...msg,
    metadata: msg.metadata ? JSON.parse(msg.metadata as unknown as string) : null,
  }));
}

export function getThreadMessages(channelId: string, threadTs: string): Message[] {
  const sessionId = `thread:${channelId}:${threadTs}`;
  return getSessionHistory(sessionId, 100);
}

export function clearSessionHistory(sessionId: string): void {
  db.prepare(`DELETE FROM messages WHERE session_id = ?`).run(sessionId);
  logger.info(`Cleared history for session: ${sessionId}`);
}

// ============================================
// Scheduled Tasks
// ============================================

export interface ScheduledTask {
  id: number;
  userId: string;
  channelId: string;
  threadTs: string | null;
  taskDescription: string;
  cronExpression: string | null;
  scheduledTime: number | null;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: number;
  executedAt: number | null;
  metadata: Record<string, unknown> | null;
}

export function createScheduledTask(
  userId: string,
  channelId: string,
  taskDescription: string,
  scheduledTime: number | null = null,
  cronExpression: string | null = null,
  threadTs: string | null = null
): ScheduledTask {
  const result = db.prepare(`
    INSERT INTO scheduled_tasks 
    (user_id, channel_id, thread_ts, task_description, cron_expression, scheduled_time)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, channelId, threadTs, taskDescription, cronExpression, scheduledTime);

  return {
    id: Number(result.lastInsertRowid),
    userId,
    channelId,
    threadTs,
    taskDescription,
    cronExpression,
    scheduledTime,
    status: 'pending',
    createdAt: Math.floor(Date.now() / 1000),
    executedAt: null,
    metadata: null,
  };
}

export function getPendingTasks(): ScheduledTask[] {
  const now = Math.floor(Date.now() / 1000);
  return db.prepare(`
    SELECT * FROM scheduled_tasks
    WHERE status = 'pending'
    AND (scheduled_time IS NULL OR scheduled_time <= ?)
    ORDER BY scheduled_time ASC
  `).all(now) as ScheduledTask[];
}

export function updateTaskStatus(
  taskId: number,
  status: ScheduledTask['status']
): void {
  db.prepare(`
    UPDATE scheduled_tasks
    SET status = ?, executed_at = CASE WHEN ? IN ('completed', 'failed') THEN unixepoch() ELSE executed_at END
    WHERE id = ?
  `).run(status, status, taskId);
}

export function getUserTasks(userId: string): ScheduledTask[] {
  return db.prepare(`
    SELECT * FROM scheduled_tasks
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 20
  `).all(userId) as ScheduledTask[];
}

export function cancelTask(taskId: number, userId: string): boolean {
  const result = db.prepare(`
    UPDATE scheduled_tasks
    SET status = 'cancelled'
    WHERE id = ? AND user_id = ? AND status = 'pending'
  `).run(taskId, userId);

  return result.changes > 0;
}

// ============================================
// DM Pairing Security
// ============================================

export function generatePairingCode(userId: string): string {
  // Generate 6-character alphanumeric code
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  const expiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour

  // Delete any existing codes for this user
  db.prepare(`DELETE FROM pairing_codes WHERE user_id = ?`).run(userId);

  // Create new code
  db.prepare(`
    INSERT INTO pairing_codes (code, user_id, expires_at)
    VALUES (?, ?, ?)
  `).run(code, userId, expiresAt);

  return code;
}

export function verifyPairingCode(code: string): string | null {
  const now = Math.floor(Date.now() / 1000);
  const result = db.prepare(`
    SELECT user_id FROM pairing_codes
    WHERE code = ? AND expires_at > ? AND approved = 0
  `).get(code.toUpperCase()) as { user_id: string } | undefined;

  return result?.user_id || null;
}

export function approvePairing(code: string, approvedBy: string): boolean {
  const userId = verifyPairingCode(code);
  if (!userId) return false;

  db.prepare(`
    UPDATE pairing_codes SET approved = 1 WHERE code = ?
  `).run(code.toUpperCase());

  db.prepare(`
    INSERT OR REPLACE INTO approved_users (user_id, approved_by)
    VALUES (?, ?)
  `).run(userId, approvedBy);

  return true;
}

export function isUserApproved(userId: string): boolean {
  // Check if user is in allowed list or approved users
  if (config.security.allowedUsers.includes('*')) return true;
  if (config.security.allowedUsers.includes(userId)) return true;

  const result = db.prepare(`
    SELECT 1 FROM approved_users WHERE user_id = ?
  `).get(userId);

  return !!result;
}

// ============================================
// Cleanup and Maintenance
// ============================================

export function cleanupOldSessions(maxAgeSeconds: number = 86400 * 7): number {
  const cutoff = Math.floor(Date.now() / 1000) - maxAgeSeconds;
  const result = db.prepare(`
    DELETE FROM sessions WHERE last_activity < ?
  `).run(cutoff);

  logger.info(`Cleaned up ${result.changes} old sessions`);
  return result.changes;
}

export function cleanupExpiredPairingCodes(): number {
  const now = Math.floor(Date.now() / 1000);
  const result = db.prepare(`
    DELETE FROM pairing_codes WHERE expires_at < ? AND approved = 0
  `).run(now);

  return result.changes;
}

/**
 * Close the database connection.
 * Should be called during graceful shutdown.
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
  }
}

// ============================================
// API Key Management
// ============================================

export interface APIKey {
  id: number;
  provider: string;
  encryptedKey: string;
  encryptionIv: string;
  name: string | null;
  isActive: number;
  createdAt: number;
  lastUsed: number | null;
}

export function createAPIKey(
  provider: string,
  encryptedKey: string,
  encryptionIv: string,
  name: string | null = null
): APIKey {
  const result = db.prepare(`
    INSERT INTO api_keys (provider, encrypted_key, encryption_iv, name)
    VALUES (?, ?, ?, ?)
  `).run(provider, encryptedKey, encryptionIv, name);

  return {
    id: Number(result.lastInsertRowid),
    provider,
    encryptedKey,
    encryptionIv,
    name,
    isActive: 0,
    createdAt: Math.floor(Date.now() / 1000),
    lastUsed: null,
  };
}

export function getAllAPIKeys(): APIKey[] {
  return db.prepare(`
    SELECT
      id,
      provider,
      encrypted_key as encryptedKey,
      encryption_iv as encryptionIv,
      name,
      is_active as isActive,
      created_at as createdAt,
      last_used as lastUsed
    FROM api_keys
    ORDER BY created_at DESC
  `).all() as APIKey[];
}

export function getActiveAPIKey(provider?: string): APIKey | null {
  if (provider) {
    return db.prepare(`
      SELECT
        id,
        provider,
        encrypted_key as encryptedKey,
        encryption_iv as encryptionIv,
        name,
        is_active as isActive,
        created_at as createdAt,
        last_used as lastUsed
      FROM api_keys
      WHERE provider = ? AND is_active = 1
      LIMIT 1
    `).get(provider) as APIKey | undefined || null;
  } else {
    return db.prepare(`
      SELECT
        id,
        provider,
        encrypted_key as encryptedKey,
        encryption_iv as encryptionIv,
        name,
        is_active as isActive,
        created_at as createdAt,
        last_used as lastUsed
      FROM api_keys
      WHERE is_active = 1
      LIMIT 1
    `).get() as APIKey | undefined || null;
  }
}

export function setActiveAPIKey(keyId: number): boolean {
  // First, get the provider of the key we want to activate
  const key = db.prepare(`
    SELECT provider FROM api_keys WHERE id = ?
  `).get(keyId) as { provider: string } | undefined;

  if (!key) return false;

  // Deactivate all keys for this provider
  db.prepare(`
    UPDATE api_keys SET is_active = 0 WHERE provider = ?
  `).run(key.provider);

  // Activate the selected key
  const result = db.prepare(`
    UPDATE api_keys SET is_active = 1 WHERE id = ?
  `).run(keyId);

  return result.changes > 0;
}

export function deleteAPIKey(keyId: number): boolean {
  const result = db.prepare(`
    DELETE FROM api_keys WHERE id = ?
  `).run(keyId);

  return result.changes > 0;
}

export function updateAPIKeyLastUsed(keyId: number): void {
  db.prepare(`
    UPDATE api_keys SET last_used = unixepoch() WHERE id = ?
  `).run(keyId);
}

// ============================================
// Calendar Credentials
// ============================================

export interface CalendarCredential {
  id: number;
  provider: string;
  authType: 'service_account' | 'oauth';
  encryptedCredentials: string;
  encryptionIv: string;
  label: string | null;
  oauthEmail: string | null;
  isActive: number;
  createdAt: number;
}

export function saveCalendarCredential(
  encryptedCredentials: string,
  encryptionIv: string,
  label: string | null = null,
  provider: string = 'google'
): CalendarCredential {
  // Replace any existing credential for this provider
  db.prepare(`DELETE FROM calendar_credentials WHERE provider = ?`).run(provider);

  const result = db.prepare(`
    INSERT INTO calendar_credentials (provider, auth_type, encrypted_credentials, encryption_iv, label, is_active)
    VALUES (?, 'service_account', ?, ?, ?, 1)
  `).run(provider, encryptedCredentials, encryptionIv, label);

  return {
    id: Number(result.lastInsertRowid),
    provider,
    authType: 'service_account',
    encryptedCredentials,
    encryptionIv,
    label,
    oauthEmail: null,
    isActive: 1,
    createdAt: Math.floor(Date.now() / 1000),
  };
}

export function saveOAuthCalendarCredential(
  encryptedTokens: string,
  encryptionIv: string,
  email: string,
  provider: string = 'google'
): CalendarCredential {
  db.prepare(`DELETE FROM calendar_credentials WHERE provider = ?`).run(provider);

  const result = db.prepare(`
    INSERT INTO calendar_credentials (provider, auth_type, encrypted_credentials, encryption_iv, label, oauth_email, is_active)
    VALUES (?, 'oauth', ?, ?, ?, ?, 1)
  `).run(provider, encryptedTokens, encryptionIv, email, email);

  return {
    id: Number(result.lastInsertRowid),
    provider,
    authType: 'oauth',
    encryptedCredentials: encryptedTokens,
    encryptionIv,
    label: email,
    oauthEmail: email,
    isActive: 1,
    createdAt: Math.floor(Date.now() / 1000),
  };
}

export function getCalendarCredential(provider: string = 'google'): CalendarCredential | null {
  const row = db.prepare(`
    SELECT
      id,
      provider,
      auth_type as authType,
      encrypted_credentials as encryptedCredentials,
      encryption_iv as encryptionIv,
      label,
      oauth_email as oauthEmail,
      is_active as isActive,
      created_at as createdAt
    FROM calendar_credentials
    WHERE provider = ? AND is_active = 1
    LIMIT 1
  `).get(provider) as CalendarCredential | undefined;

  return row || null;
}

export function deleteCalendarCredential(provider: string = 'google'): boolean {
  const result = db.prepare(`DELETE FROM calendar_credentials WHERE provider = ?`).run(provider);
  return result.changes > 0;
}

// Export database instance for advanced queries
export { db };
