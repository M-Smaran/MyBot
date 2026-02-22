/**
 * Unified LLM Provider Types
 *
 * Common interfaces for all LLM providers.
 */

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  tool_calls?: LLMToolCall[];
  name?: string;
}

export interface LLMTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

export interface LLMToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface LLMResponse {
  content: string | null;
  tool_calls?: LLMToolCall[];
  finish_reason?: string;
}

export interface LLMProvider {
  name: string;
  chatCompletion(
    messages: LLMMessage[],
    tools: LLMTool[],
    options?: {
      maxTokens?: number;
      temperature?: number;
    }
  ): Promise<LLMResponse>;
}

export type ProviderType = 'openai' | 'anthropic' | 'gemini' | 'kimi' | 'together';
