import { useEffect, useRef, useState, useCallback } from 'react';
import type { Message, WSMessage } from '../types';

export function useWebSocket() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:3001');
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data: WSMessage = JSON.parse(event.data);

        if (data.type === 'message') {
          setIsTyping(false);
          setMessages(prev => [
            ...prev,
            {
              id: Date.now().toString(),
              role: 'assistant',
              content: data.content || '',
              timestamp: new Date(),
              metadata: data.metadata,
            },
          ]);

          if (data.sessionId) {
            sessionIdRef.current = data.sessionId;
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

    // Add user message to UI immediately
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);

    // Send to server
    wsRef.current.send(JSON.stringify({
      type: 'chat',
      content,
      sessionId: sessionIdRef.current,
    }));
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    sessionIdRef.current = null;
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

  return {
    messages,
    isConnected,
    isTyping,
    sendMessage,
    clearMessages,
    addSystemMessage,
  };
}
