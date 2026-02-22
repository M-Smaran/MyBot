/**
 * LLM Client Factory
 *
 * Creates the appropriate LLM provider client based on active API key.
 */

import { getActiveAPIKey, updateAPIKeyLastUsed } from '../../../memory/database.js';
import { decryptAPIKey } from '../encryption.js';
import { OpenAIProvider } from './providers/openai-provider.js';
import { AnthropicProvider } from './providers/anthropic-provider.js';
import { GeminiProvider } from './providers/gemini-provider.js';
import { KimiProvider } from './providers/kimi-provider.js';
import { TogetherProvider } from './providers/together-provider.js';
import type { LLMProvider, ProviderType } from './types.js';
import { createModuleLogger } from '../../../utils/logger.js';

const logger = createModuleLogger('llm-factory');

/**
 * Get the active LLM provider client.
 *
 * @returns LLM provider client
 * @throws Error if no active API key is configured
 */
export async function getActiveLLMClient(): Promise<LLMProvider> {
  const activeKey = getActiveAPIKey();

  if (!activeKey) {
    throw new Error('No active API key configured. Please add an API key in Settings.');
  }

  // Decrypt the API key
  const apiKey = decryptAPIKey(activeKey.encryptedKey, activeKey.encryptionIv);

  // Update last used timestamp
  updateAPIKeyLastUsed(activeKey.id);

  // Create the appropriate provider
  const provider = activeKey.provider as ProviderType;

  logger.info(`Creating LLM client for provider: ${provider}`);

  switch (provider) {
    case 'openai':
      return new OpenAIProvider(apiKey);

    case 'anthropic':
      return new AnthropicProvider(apiKey);

    case 'gemini':
      return new GeminiProvider(apiKey);

    case 'kimi':
      return new KimiProvider(apiKey);

    case 'together':
      return new TogetherProvider(apiKey);

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

/**
 * Check if an LLM provider is configured.
 */
export function hasActiveLLMProvider(): boolean {
  const activeKey = getActiveAPIKey();
  return activeKey !== null;
}
