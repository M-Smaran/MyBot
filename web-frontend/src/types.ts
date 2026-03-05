export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  type?: 'upload';
  uploadInfo?: {
    fileName: string;
    fileSize: number;
    chunks: number;
  };
  metadata?: {
    ragUsed?: boolean;
    sourcesCount?: number;
    memoryUsed?: boolean;
    memoriesCount?: number;
  };
}

export interface APIKey {
  id: number;
  provider: 'openai' | 'anthropic' | 'gemini' | 'kimi';
  name: string | null;
  isActive: boolean;
  createdAt: number;
  lastUsed: number | null;
}

export interface WSMessage {
  type: 'message' | 'error' | 'status' | 'stream_chunk';
  content?: string;
  sessionId?: string;
  metadata?: {
    ragUsed?: boolean;
    sourcesCount?: number;
    memoryUsed?: boolean;
    memoriesCount?: number;
  };
}
