import { useEffect, useRef, useState, useCallback } from 'react';
import type { Message, WSMessage } from '../types';
import { api } from '../services/api';

const SESSION_KEY = 'mybot_session_id';

export function useWebSocket() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(localStorage.getItem(SESSION_KEY));
  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(localStorage.getItem(SESSION_KEY));

  // Load history from server when the hook mounts
  useEffect(() => {
    const savedSessionId = localStorage.getItem(SESSION_KEY);
    if (!savedSessionId) return;

    api.getHistory(savedSessionId).then(history => {
      if (history.length === 0) return;
      const loaded: Message[] = history
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map((m, i) => ({
          id: `history-${i}`,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: new Date(m.createdAt * 1000),
        }));
      setMessages(loaded);
    }).catch(() => {
      localStorage.removeItem(SESSION_KEY);
      sessionIdRef.current = null;
    });
  }, []);

  useEffect(() => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = import.meta.env.VITE_WS_URL || `${wsProtocol}//${window.location.host}`;
    const ws = new WebSocket(wsHost);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data: WSMessage = JSON.parse(event.data);

        if (data.type === 'stream_chunk') {
          // Append token to the in-progress streaming message
          setIsTyping(false);
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last && last.id === '__streaming__') {
              return [
                ...prev.slice(0, -1),
                { ...last, content: last.content + (data.content || '') },
              ];
            }
            // First chunk — create a new streaming bubble
            return [
              ...prev,
              {
                id: '__streaming__',
                role: 'assistant' as const,
                content: data.content || '',
                timestamp: new Date(),
              },
            ];
          });
        } else if (data.type === 'message') {
          setIsTyping(false);
          // Replace the streaming bubble (if any) with the final message + metadata
          setMessages(prev => {
            const last = prev[prev.length - 1];
            const finalMsg = {
              id: Date.now().toString(),
              role: 'assistant' as const,
              content: data.content || '',
              timestamp: new Date(),
              metadata: data.metadata,
            };
            if (last && last.id === '__streaming__') {
              return [...prev.slice(0, -1), finalMsg];
            }
            return [...prev, finalMsg];
          });

          if (data.sessionId) {
            sessionIdRef.current = data.sessionId;
            setCurrentSessionId(data.sessionId);
            localStorage.setItem(SESSION_KEY, data.sessionId);
          }
        } else if (data.type === 'status') {
          if (data.content === 'typing') {
            setIsTyping(true);
          }
        } else if (data.type === 'error') {
          setIsTyping(false);
          setMessages(prev => [
            ...prev,
            {
              id: Date.now().toString(),
              role: 'assistant',
              content: `Error: ${data.content}`,
              timestamp: new Date(),
            },
          ]);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setIsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, []);

  const sendMessage = useCallback((content: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('WebSocket is not connected');
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);

    wsRef.current.send(JSON.stringify({
      type: 'chat',
      content,
      sessionId: sessionIdRef.current,
    }));
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    sessionIdRef.current = null;
    setCurrentSessionId(null);
    localStorage.removeItem(SESSION_KEY);
  }, []);

  // Load a specific past session by ID
  const loadSession = useCallback(async (sessionId: string) => {
    const history = await api.getHistory(sessionId);
    const loaded: Message[] = history
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map((m, i) => ({
        id: `history-${sessionId}-${i}`,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: new Date(m.createdAt * 1000),
      }));
    setMessages(loaded);
    sessionIdRef.current = sessionId;
    setCurrentSessionId(sessionId);
    localStorage.setItem(SESSION_KEY, sessionId);
  }, []);

  const addSystemMessage = useCallback((content: string) => {
    const msg: Message = {
      id: Date.now().toString(),
      role: 'assistant',
      content,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, msg]);
  }, []);

  const addUploadMessage = useCallback((fileName: string, fileSize: number, chunks: number) => {
    const msg: Message = {
      id: Date.now().toString(),
      role: 'assistant',
      content: '',
      type: 'upload',
      uploadInfo: { fileName, fileSize, chunks },
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, msg]);
  }, []);

  return {
    messages,
    isConnected,
    isTyping,
    currentSessionId,
    sendMessage,
    clearMessages,
    loadSession,
    addSystemMessage,
    addUploadMessage,
  };
}
