import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Message } from '@shared/schema';

/**
 * Global WebSocket hook that maintains connection across all pages
 * This ensures AI messages are received even when user navigates away from chat
 */
export function useGlobalWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();
  const streamingTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    function connect() {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[Global WS] Connected');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[Global WS] Message received:', data.type);
          
          if (data.type === 'new_message' && data.payload) {
            const message = data.payload as Message;
            
            // Update message list cache for the conversation
            queryClient.setQueryData(
              ["/api/messages", message.conversationId],
              (old: Message[] = []) => {
                // Avoid duplicates
                if (!old.find(m => m.id === message.id)) {
                  return [...old, message];
                }
                return old;
              }
            );
            
            // Also invalidate with different limits
            queryClient.invalidateQueries({ 
              predicate: (query) => {
                const key = query.queryKey;
                return key[0] === "/api/messages" && key[1] === message.conversationId;
              }
            });
            
            // Update conversation list cache (optimistic update)
            queryClient.setQueryData(
              ["/api/conversations"],
              (old: any[] = []) => {
                if (!old || old.length === 0) return old;
                
                return old.map(conv => {
                  if (conv.id === message.conversationId) {
                    return {
                      ...conv,
                      lastMessageAt: new Date().toISOString(),
                      lastMessage: message,
                    };
                  }
                  return conv;
                });
              }
            );
            
            // For AI messages, manage streaming timeout
            if (message.senderType === 'ai') {
              // Clear existing timeout
              if (streamingTimeoutRef.current) {
                clearTimeout(streamingTimeoutRef.current);
              }
              
              // Set new timeout to detect end of streaming
              streamingTimeoutRef.current = setTimeout(() => {
                console.log('[Global WS] AI streaming complete (timeout)');
              }, 5000);
            }
          }
        } catch (error) {
          console.error('[Global WS] Error parsing message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('[Global WS] Error:', error);
      };

      ws.onclose = () => {
        console.log('[Global WS] Disconnected, reconnecting in 3s...');
        // Auto reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('[Global WS] Attempting reconnect...');
          connect();
        }, 3000);
      };
    }

    connect();

    // Cleanup: close connection but don't leave conversations
    return () => {
      if (streamingTimeoutRef.current) {
        clearTimeout(streamingTimeoutRef.current);
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    };
  }, [queryClient]);

  return wsRef;
}

/**
 * Hook to send join/leave conversation events
 * Used in chat page to notify server of current conversation
 */
export function useConversationSubscription(
  wsRef: React.RefObject<WebSocket | null>,
  conversationId: string | null
) {
  useEffect(() => {
    if (!conversationId || !wsRef.current) return;

    const ws = wsRef.current;
    
    // Wait for connection to be ready
    const sendJoin = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'join_conversation',
          payload: { conversationId }
        }));
        console.log('[WS] Joined conversation:', conversationId);
      } else {
        // Connection not ready, wait and retry
        setTimeout(sendJoin, 100);
      }
    };

    sendJoin();

    // Send leave when conversation changes or component unmounts
    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'leave_conversation',
          payload: { conversationId }
        }));
        console.log('[WS] Left conversation:', conversationId);
      }
    };
  }, [wsRef, conversationId]);
}
