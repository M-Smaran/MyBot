import { useState, useRef, useEffect } from 'react';
import { Send, Trash2, Database, Brain, Loader2, MessageSquare, Paperclip } from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';
import type { Message } from '../types';
import { api } from '../services/api';

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[70%] rounded-lg px-4 py-3 ${
          isUser
            ? 'bg-primary-600 text-white'
            : 'bg-dark-800 text-dark-100 border border-dark-700'
        }`}
      >
        <div className="whitespace-pre-wrap break-words">{message.content}</div>

        {message.metadata && !isUser && (
          <div className="mt-2 flex items-center space-x-3 text-xs opacity-70">
            {message.metadata.ragUsed && (
              <div className="flex items-center space-x-1">
                <Database className="w-3 h-3" />
                <span>{message.metadata.sourcesCount} sources</span>
              </div>
            )}
            {message.metadata.memoryUsed && (
              <div className="flex items-center space-x-1">
                <Brain className="w-3 h-3" />
                <span>{message.metadata.memoriesCount} memories</span>
              </div>
            )}
          </div>
        )}

        <div className="mt-1 text-xs opacity-50">
          {message.timestamp.toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}

export function ChatPage() {
  const { messages, isConnected, isTyping, sendMessage, clearMessages, addSystemMessage } = useWebSocket();
  const [input, setInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !isConnected) return;

    sendMessage(input.trim());
    setInput('');
  };

  const handleUploadClick = () => {
    if (!isConnected || isUploading) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      await api.uploadDocument(file);
      // Read file locally so the user can see its contents in the chat interface
      const reader = new FileReader();
      reader.onload = () => {
        const text = typeof reader.result === 'string' ? reader.result : '';
        addSystemMessage(
          `📄 Uploaded document "${file.name}" (${file.size} bytes):\n\n` +
          (text ? text : '(Unable to preview file contents)')
        );
      };
      reader.onerror = () => {
        addSystemMessage(`📄 Uploaded document "${file.name}" (${file.size} bytes). (Preview failed)`);
      };
      reader.readAsText(file);
    } catch (error: any) {
      addSystemMessage(`❌ Failed to upload document "${file.name}": ${error.message || 'Unknown error'}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="h-full flex flex-col max-w-5xl mx-auto">
      {/* Header */}
      <div className="px-4 py-3 border-b border-dark-700 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
          <span className="text-sm text-dark-300">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        <button
          onClick={clearMessages}
          className="text-dark-400 hover:text-primary-500 transition-colors"
          title="Clear chat"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center text-dark-400">
              <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg">Start a conversation</p>
              <p className="text-sm mt-2">Ask me anything!</p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}

            {isTyping && (
              <div className="flex justify-start mb-4">
                <div className="bg-dark-800 border border-dark-700 rounded-lg px-4 py-3">
                  <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-dark-700 p-4">
        <form onSubmit={handleSubmit} className="flex space-x-2 items-center">
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={handleUploadClick}
            disabled={!isConnected || isUploading}
            className="p-2 rounded-lg border border-dark-600 text-dark-300 hover:text-white hover:border-primary-500 hover:bg-dark-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title={isUploading ? 'Uploading...' : 'Upload document for RAG'}
          >
            {isUploading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Paperclip className="w-5 h-5" />
            )}
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              isConnected ? 'Type your message...' : 'Connecting...'
            }
            disabled={!isConnected}
            className="input flex-1"
          />
          <button
            type="submit"
            disabled={!input.trim() || !isConnected}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
