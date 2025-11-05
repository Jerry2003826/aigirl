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
            console.log('[Global WS] Received new_message:', message.id, message.senderType, message.content?.substring(0, 20));
            
            // Check if user is currently viewing this conversation
            const currentPath = window.location.pathname;
            const params = new URLSearchParams(window.location.search);
            const currentConversationId = params.get('conversationId');
            const isInThisChat = currentPath === '/chat' && currentConversationId === message.conversationId;
            
            console.log('[Global WS] Updating message cache for conversation:', message.conversationId);
            // Directly update cache instead of invalidate - this is instant!
            queryClient.setQueriesData(
              {
                predicate: (query) => {
                  const key = query.queryKey;
                  // Match: ["/api/messages", conversationId, limit]
                  return key[0] === "/api/messages" && key[1] === message.conversationId && typeof key[2] === 'number';
                }
              },
              (oldData: Message[] | undefined) => {
                if (!oldData) return oldData;
                // Check if message already exists to prevent duplicates
                const messageExists = oldData.some(m => m.id === message.id);
                if (messageExists) {
                  console.log('[Global WS] Message already in cache, skipping:', message.id);
                  return oldData;
                }
                console.log('[Global WS] Adding message to cache:', message.id);
                // Backend returns DESC (newest first), prepend to maintain DESC order
                return [message, ...oldData];
              }
            );
            
            // Also update history dialog query if it exists
            queryClient.setQueriesData(
              {
                predicate: (query) => {
                  const key = query.queryKey;
                  return key[0] === "/api/messages/all" && key[1] === message.conversationId;
                }
              },
              (oldData: Message[] | undefined) => {
                if (!oldData) return oldData;
                // Check if message already exists
                const messageExists = oldData.some(m => m.id === message.id);
                if (messageExists) return oldData;
                return [message, ...oldData];
              }
            );
            
            // Update conversation list cache (optimistic update)
            // NO invalidate needed - setQueryData already updates the UI
            queryClient.setQueryData(
              ["/api/conversations"],
              (old: any[] = []) => {
                if (!old || old.length === 0) return old;
                
                return old.map(conv => {
                  if (conv.id === message.conversationId) {
                    // Increment unread count only if:
                    // 1. User is NOT currently viewing this chat
                    // 2. Message is from AI (not sent by user)
                    const shouldIncrement = !isInThisChat && message.senderType === 'ai';
                    
                    return {
                      ...conv,
                      lastMessageAt: new Date().toISOString(),
                      lastMessage: message,
                      unreadCount: shouldIncrement ? (conv.unreadCount || 0) + 1 : conv.unreadCount,
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
          
          // Handle Moments events
          else if (data.type === 'moment_created' && data.payload) {
            console.log('[Global WS] Moment created, refreshing moments...');
            // Invalidate moments list to show new moment
            queryClient.invalidateQueries({ queryKey: ["/api/moments"] });
          }
          else if (data.type === 'moment_deleted' && data.payload) {
            console.log('[Global WS] Moment deleted, refreshing moments...');
            // Invalidate moments list to remove deleted moment
            queryClient.invalidateQueries({ queryKey: ["/api/moments"] });
          }
          else if (data.type === 'moment_liked' && data.payload) {
            console.log('[Global WS] Moment liked/unliked, refreshing moments...');
            // Invalidate moments list to update like count
            queryClient.invalidateQueries({ queryKey: ["/api/moments"] });
          }
          else if (data.type === 'moment_commented' && data.payload) {
            console.log('[Global WS] New moment comment, refreshing moments and comments...');
            const { momentId } = data.payload;
            // Invalidate moments list to update comment count
            queryClient.invalidateQueries({ queryKey: ["/api/moments"] });
            // Invalidate comments for this specific moment
            if (momentId) {
              queryClient.invalidateQueries({ queryKey: ["/api/moments", momentId, "comments"] });
            }
            // Also invalidate unread comment notifications
            queryClient.invalidateQueries({ queryKey: ["/api/moments/unread-comments"] });
          }
          
          // Handle Groups events
          else if (data.type === 'group_created' && data.payload) {
            console.log('[Global WS] Group created, refreshing conversations...');
            // Invalidate conversations list to show new group
            queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
          }
          else if (data.type === 'group_participant_added' && data.payload) {
            console.log('[Global WS] Participant added, refreshing conversation details...');
            const { conversationId } = data.payload;
            // Invalidate specific conversation details
            if (conversationId) {
              queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId] });
              queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId, "participants"] });
            }
            // Also invalidate conversations list
            queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
          }
          else if (data.type === 'group_participant_removed' && data.payload) {
            console.log('[Global WS] Participant removed, refreshing conversation details...');
            const { conversationId } = data.payload;
            // Invalidate specific conversation details
            if (conversationId) {
              queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId] });
              queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId, "participants"] });
            }
            // Also invalidate conversations list
            queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
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
