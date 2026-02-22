/**
 * API Key Encryption Module
 *
 * Encrypts and decrypts API keys using AES-256-GCM.
 * Keys are stored encrypted in the database and only decrypted when needed.
 */

import crypto from 'crypto';
import { config } from '../../config/index.js';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits

/**
 * Get or derive the encryption key from config.
 */
function getEncryptionKey(): Buffer {
  const keyString = config.web.encryptionKey || 'default-key-change-me';

  // If key is exactly 32 bytes, use it directly
  if (keyString.length === 32) {
    return Buffer.from(keyString, 'utf-8');
  }

  // Otherwise, derive a 32-byte key using SHA-256
  return crypto.createHash('sha256').update(keyString).digest();
}

/**
 * Encrypt an API key.
 *
 * @param apiKey - The plain text API key
 * @returns Object with encrypted data and IV
 */
export function encryptAPIKey(apiKey: string): { encrypted: string; iv: string } {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(apiKey, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  return {
    encrypted: encrypted + ':' + authTag.toString('base64'),
    iv: iv.toString('base64')
  };
}

/**
 * Decrypt an API key.
 *
 * @param encrypted - The encrypted API key (includes auth tag)
 * @param iv - The initialization vector (base64)
 * @returns The decrypted API key
 */
export function decryptAPIKey(encrypted: string, iv: string): string {
  const key = getEncryptionKey();

  // Split encrypted data and auth tag
  const parts = encrypted.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted data format');
  }

  const encryptedData = parts[0];
  const authTag = Buffer.from(parts[1], 'base64');

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, 'base64')
  );

  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Mask an API key for display (show only first/last few characters).
 *
 * @param apiKey - The API key to mask
 * @returns Masked version like "sk-...xyz123"
 */
export function maskAPIKey(apiKey: string): string {
  if (apiKey.length < 10) {
    return '***';
  }

  const start = apiKey.substring(0, 6);
  const end = apiKey.substring(apiKey.length - 4);

  return `${start}...${end}`;
}
