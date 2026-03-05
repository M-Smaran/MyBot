/**
 * Anthropic Claude Provider Adapter
 */

import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, LLMMessage, LLMTool, LLMResponse, LLMToolCall } from '../types.js';

export class AnthropicProvider implements LLMProvider {
  name = 'Anthropic';
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string = 'claude-sonnet-4-20250514') {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async chatCompletion(
    messages: LLMMessage[],
    tools: LLMTool[],
    options?: { maxTokens?: number; temperature?: number }
  ): Promise<LLMResponse> {
    // Extract system message
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    // Convert messages to Anthropic format
    // Anthropic requires tool results to be grouped with the preceding assistant message
    // We handle this by grouping consecutive tool messages into a single user message.
    const anthropicMessages: any[] = [];
    let i = 0;
    while (i < nonSystemMessages.length) {
      const msg = nonSystemMessages[i];

      if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
        // Assistant message with tool calls — build content blocks
        const contentBlocks: any[] = [];
        if (msg.content) contentBlocks.push({ type: 'text', text: msg.content });
        for (const tc of msg.tool_calls) {
          contentBlocks.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments),
          });
        }
        anthropicMessages.push({ role: 'assistant', content: contentBlocks });

        // Collect the following tool result messages into a single user message
        i++;
        const toolResults: any[] = [];
        while (i < nonSystemMessages.length && nonSystemMessages[i].role === 'tool') {
          const toolMsg = nonSystemMessages[i];
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolMsg.tool_call_id!,
            content: toolMsg.content ?? '',
          });
          i++;
        }
        if (toolResults.length > 0) {
          anthropicMessages.push({ role: 'user', content: toolResults });
        }
        continue;
      }

      if (msg.role === 'tool') {
        // Orphaned tool message (shouldn't happen) — wrap it
        anthropicMessages.push({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: msg.tool_call_id!, content: msg.content ?? '' }],
        });
      } else {
        anthropicMessages.push({
          role: msg.role === 'assistant' ? ('assistant' as const) : ('user' as const),
          content: msg.content ?? '',
        });
      }
      i++;
    }

    // Convert tools to Anthropic format
    const anthropicTools = tools.map(tool => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters,
    }));

    const response = await this.client.messages.create({
      model: this.model,
      system: systemMessage,
      messages: anthropicMessages as any,
      tools: anthropicTools.length > 0 ? anthropicTools : undefined,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature,
    });

    // Convert response back to our format
    let content = '';
    const toolCalls: LLMToolCall[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        content += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input),
          },
        });
      }
    }

    return {
      content: content || null,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      finish_reason: response.stop_reason || undefined,
    };
  }

  async streamChatCompletion(
    messages: LLMMessage[],
    options?: { maxTokens?: number; temperature?: number },
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    const systemMessages = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    // Use same grouping logic as chatCompletion to properly handle tool messages
    const anthropicMessages: any[] = [];
    let i = 0;
    while (i < nonSystemMessages.length) {
      const msg = nonSystemMessages[i];

      if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
        const contentBlocks: any[] = [];
        if (msg.content) contentBlocks.push({ type: 'text', text: msg.content });
        for (const tc of msg.tool_calls) {
          contentBlocks.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments),
          });
        }
        anthropicMessages.push({ role: 'assistant', content: contentBlocks });

        i++;
        const toolResults: any[] = [];
        while (i < nonSystemMessages.length && nonSystemMessages[i].role === 'tool') {
          const toolMsg = nonSystemMessages[i];
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolMsg.tool_call_id!,
            content: toolMsg.content ?? '',
          });
          i++;
        }
        if (toolResults.length > 0) {
          anthropicMessages.push({ role: 'user', content: toolResults });
        }
        continue;
      }

      if (msg.role === 'tool') {
        anthropicMessages.push({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: msg.tool_call_id!, content: msg.content ?? '' }],
        });
      } else {
        anthropicMessages.push({
          role: msg.role === 'assistant' ? ('assistant' as const) : ('user' as const),
          content: msg.content ?? '',
        });
      }
      i++;
    }

    let full = '';
    const stream = this.client.messages.stream({
      model: this.model,
      system: systemMessages || undefined,
      messages: anthropicMessages as any,
      max_tokens: options?.maxTokens || 1500,
      temperature: options?.temperature,
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        full += chunk.delta.text;
        onChunk?.(chunk.delta.text);
      }
    }
    return full;
  }
}
