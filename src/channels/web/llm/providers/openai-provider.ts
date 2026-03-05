/**
 * OpenAI Provider Adapter
 */

import OpenAI from 'openai';
import type { LLMProvider, LLMMessage, LLMTool, LLMResponse } from '../types.js';

export class OpenAIProvider implements LLMProvider {
  name = 'OpenAI';
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = 'gpt-4o') {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async chatCompletion(
    messages: LLMMessage[],
    tools: LLMTool[],
    options?: { maxTokens?: number; temperature?: number }
  ): Promise<LLMResponse> {
    // Convert our messages to OpenAI format
    const openaiMessages = messages.map(msg => {
      if (msg.role === 'tool') {
        return {
          role: 'tool' as const,
          content: msg.content ?? '',
          tool_call_id: msg.tool_call_id!,
        };
      }
      if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
        return {
          role: 'assistant' as const,
          content: msg.content,
          tool_calls: msg.tool_calls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.function.name, arguments: tc.function.arguments },
          })),
        };
      }
      return {
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content ?? '',
      };
    });

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: openaiMessages as any,
      tools: tools.length > 0 ? tools as any : undefined,
      tool_choice: tools.length > 0 ? 'auto' : undefined,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature,
    });

    const choice = response.choices[0];

    return {
      content: choice.message.content,
      tool_calls: choice.message.tool_calls?.map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      })),
      finish_reason: choice.finish_reason || undefined,
    };
  }

  async streamChatCompletion(
    messages: LLMMessage[],
    options?: { maxTokens?: number; temperature?: number },
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    const openaiMessages = messages.map(msg => {
      if (msg.role === 'tool') {
        return {
          role: 'tool' as const,
          content: msg.content ?? '',
          tool_call_id: msg.tool_call_id!,
        };
      }
      if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
        return {
          role: 'assistant' as const,
          content: msg.content,
          tool_calls: msg.tool_calls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.function.name, arguments: tc.function.arguments },
          })),
        };
      }
      return {
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content ?? '',
      };
    });

    let full = '';
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: openaiMessages as any,
      max_tokens: options?.maxTokens || 1500,
      temperature: options?.temperature,
      stream: true,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content ?? '';
      if (text) {
        full += text;
        onChunk?.(text);
      }
    }
    return full;
  }
}
