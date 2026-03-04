import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Trash2, Database, Brain, Loader2, MessageSquare, Paperclip, FileText, Plus, Bot } from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';
import type { Message } from '../types';
import { api } from '../services/api';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts: number): string {
  const d = new Date(ts * 1000);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

interface SessionItem {
  id: string;
  title: string;
  lastActivity: number;
  messageCount: number;
}

function Sidebar({
  activeSessionId,
  onSelectSession,
  onNewChat,
}: {
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
}) {
  const [sessions, setSessions] = useState<SessionItem[]>([]);

  const refresh = useCallback(() => {
    api.getSessions().then(setSessions).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [activeSessionId, refresh]);

  return (
    <div className="w-64 flex-shrink-0 bg-dark-900 border-r border-dark-700 flex flex-col h-full">
      <div className="p-4 border-b border-dark-700 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Bot className="w-5 h-5 text-primary-500" />
          <span className="text-sm font-semibold text-dark-200">Conversations</span>
        </div>
        <button
          onClick={onNewChat}
          className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
          title="New chat"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {sessions.length === 0 ? (
          <p className="text-xs text-dark-500 text-center mt-8 px-4">No conversations yet</p>
        ) : (
          sessions.map(s => (
            <button
              key={s.id}
              onClick={() => onSelectSession(s.id)}
              className={`w-full text-left px-4 py-3 hover:bg-dark-800 transition-colors ${
                s.id === activeSessionId ? 'bg-dark-800 border-l-2 border-primary-500' : ''
              }`}
            >
              <p className={`text-sm truncate ${s.id === activeSessionId ? 'text-white' : 'text-dark-200'}`}>
                {s.title}
              </p>
              <p className="text-xs text-dark-500 mt-0.5">
                {formatDate(s.lastActivity)} · {s.messageCount} msgs
              </p>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function UploadCard({ info }: { info: NonNullable<Message['uploadInfo']> }) {
  return (
    <div className="flex items-start space-x-3 bg-dark-800 border border-dark-600 rounded-lg px-4 py-3 max-w-xs">
      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-dark-700 border border-dark-600 flex items-center justify-center">
        <FileText className="w-5 h-5 text-primary-500" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-dark-100 truncate" title={info.fileName}>
          {info.fileName}
        </p>
        <p className="text-xs text-dark-400 mt-0.5">{formatBytes(info.fileSize)}</p>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  if (message.type === 'upload' && message.uploadInfo) {
    return (
      <div className="flex justify-start mb-4">
        <UploadCard info={message.uploadInfo} />
      </div>
    );
  }

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
  const {
    messages,
    isConnected,
    isTyping,
    currentSessionId,
    sendMessage,
    clearMessages,
    loadSession,
    addUploadMessage,
    addSystemMessage,
  } = useWebSocket();

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
      const result = await api.uploadDocument(file);
      addUploadMessage(file.name, file.size, result.chunks ?? 1);
    } catch (error: any) {
      addSystemMessage(`Failed to upload "${file.name}": ${error.message || 'Unknown error'}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="h-full flex">
      {/* Left sidebar */}
      <Sidebar
        activeSessionId={currentSessionId}
        onSelectSession={loadSession}
        onNewChat={clearMessages}
      />

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat header */}
        <div className="px-6 py-3 border-b border-dark-700 flex items-center justify-between bg-dark-900">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">MyBot</h2>
              <div className="flex items-center space-x-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-xs text-dark-400">{isConnected ? 'Online' : 'Offline'}</span>
              </div>
            </div>
          </div>

          <button
            onClick={clearMessages}
            className="text-dark-400 hover:text-primary-500 transition-colors"
            title="New chat"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
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
        <div className="border-t border-dark-700 p-4 bg-dark-900">
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
              title={isUploading ? 'Uploading...' : 'Upload document'}
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
              placeholder={isConnected ? 'Type your message...' : 'Connecting...'}
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
    </div>
  );
}
