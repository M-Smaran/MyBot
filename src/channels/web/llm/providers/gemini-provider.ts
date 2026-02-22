/**
 * Google Gemini Provider Adapter
 */

import { GoogleGenerativeAI, Content, FunctionDeclaration, Tool } from '@google/generative-ai';
import type { LLMProvider, LLMMessage, LLMTool, LLMResponse, LLMToolCall } from '../types.js';

export class GeminiProvider implements LLMProvider {
  name = 'Gemini';
  private client: GoogleGenerativeAI;
  private model: string;

  constructor(apiKey: string, model: string = 'gemini-pro') {
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = model;
  }

  async chatCompletion(
    messages: LLMMessage[],
    tools: LLMTool[],
    options?: { maxTokens?: number; temperature?: number }
  ): Promise<LLMResponse> {
    // Extract system message
    const systemInstruction = messages.find(m => m.role === 'system')?.content;
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    // Convert messages to Gemini format
    const geminiMessages: Content[] = [];

    for (const msg of nonSystemMessages) {
      if (msg.role === 'tool') {
        // Gemini expects tool responses in a specific format
        geminiMessages.push({
          role: 'function',
          parts: [{
            functionResponse: {
              name: msg.name || 'unknown',
              response: {
                result: msg.content ?? '',
              },
            },
          }],
        });
      } else {
        geminiMessages.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content ?? '' }],
        });
      }
    }

    // Convert tools to Gemini format
    const geminiTools: Tool[] = tools.length > 0 ? [{
      functionDeclarations: tools.map(tool => ({
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
      } as FunctionDeclaration)),
    }] : [];

    const model = this.client.getGenerativeModel({
      model: this.model,
      systemInstruction: systemInstruction ?? undefined,
    });

    const chat = model.startChat({
      history: geminiMessages.slice(0, -1),
      tools: geminiTools.length > 0 ? geminiTools : undefined,
    });

    const lastMessage = geminiMessages[geminiMessages.length - 1];
    const result = await chat.sendMessage(lastMessage.parts[0].text || '');

    const response = await result.response;

    // Parse response
    let content = '';
    const toolCalls: LLMToolCall[] = [];

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if ('text' in part && part.text) {
        content += part.text;
      } else if ('functionCall' in part && part.functionCall) {
        toolCalls.push({
          id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'function',
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args),
          },
        });
      }
    }

    return {
      content: content || null,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      finish_reason: response.candidates?.[0]?.finishReason || undefined,
    };
  }
}
