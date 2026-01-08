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
  const heartbeatIntervalRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Device identity (for multi-device sync registry)
    const deviceType = 'web';
    const deviceIdKey = 'ai_companion_device_id';
    const existingDeviceId = window.localStorage.getItem(deviceIdKey);
    const deviceId = existingDeviceId || `${deviceType}-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
    if (!existingDeviceId) {
      window.localStorage.setItem(deviceIdKey, deviceId);
    }
    const wsUrl = `${protocol}//${window.location.host}/ws?deviceType=${encodeURIComponent(deviceType)}&deviceId=${encodeURIComponent(deviceId)}`;
    let shouldReconnect = true;  // Flag to control reconnection
    
    function startHeartbeat(ws: WebSocket) {
      // Clear existing heartbeat
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      
      // Send ping every 25 seconds when page is visible, 60 seconds when hidden
      const sendPing = () => {
        if (ws.readyState === WebSocket.OPEN) {
          const interval = document.hidden ? 60000 : 25000;
          heartbeatIntervalRef.current = setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ping' }));
              console.log('[WebSocket] 💓 发送心跳');
            }
            sendPing(); // Schedule next ping
          }, interval);
        }
      };
      
      sendPing();
    }
    
    function connect() {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WebSocket] 🔌 连接成功');
        // Start heartbeat to keep connection alive
        startHeartbeat(ws);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[WebSocket] 📩 收到消息', { type: data.type });
          
          // Handle pong response from server
          if (data.type === 'pong') {
            console.log('[WebSocket] 💓 收到心跳响应');
            return;
          }
          
          // Initial sync hint from server
          if (data.type === 'sync_state') {
            console.log('[WebSocket] 🔄 收到sync_state，刷新关键缓存');
            queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
            queryClient.invalidateQueries({ queryKey: ["/api/moments"] });
            return;
          }

          if (data.type === 'new_message' && data.payload) {
            const message = data.payload as Message;
            console.log('[WebSocket] 📨 收到new_message事件', {
              messageId: message.id,
              clientMessageId: message.clientMessageId,
              senderType: message.senderType,
              content: message.content?.substring(0, 30),
              conversationId: message.conversationId,
            });
            
            // Check if user is currently viewing this conversation
            // Use window.__currentConversationId set by chat.tsx
            const currentPath = window.location.pathname;
            // @ts-ignore - Read from window object
            const currentConversationId = window.__currentConversationId;
            const isInThisChat = (currentPath === '/chat' || currentPath === '/') && currentConversationId === message.conversationId;
            
            console.log('[WebSocket] 🔍 开始更新缓存', {
              conversationId: message.conversationId,
              isInThisChat,
              currentPath,
              currentConversationId,
            });
            
            // CRITICAL: Replace optimistic message by clientMessageId to prevent double-render
            queryClient.setQueriesData(
              {
                predicate: (query) => {
                  const key = query.queryKey;
                  // Match: ["/api/messages", conversationId, limit]
                  return key[0] === "/api/messages" && key[1] === message.conversationId && typeof key[2] === 'number';
                }
              },
              (oldData: Message[] | undefined) => {
                if (!oldData) {
                  // 缓存为空，创建新数组
                  console.log('[WebSocket] 📥 缓存为空，创建新数组并添加消息', { messageId: message.id });
                  return [message];
                }
                
                console.log('[WebSocket] 📋 当前缓存状态', {
                  cacheLength: oldData.length,
                  cachePreview: oldData.slice(0, 3).map(m => ({
                    id: m.id,
                    clientMessageId: m.clientMessageId,
                    senderType: m.senderType,
                    content: m.content?.substring(0, 20),
                  })),
                });
                
                // Check if message already exists by ID to prevent duplicates
                const messageExists = oldData.some(m => m.id === message.id);
                if (messageExists) {
                  console.log('[WebSocket] ⏭️ 消息已存在，跳过', { messageId: message.id });
                  return oldData;
                }
                
                // CRITICAL FIX: If message has clientMessageId, replace optimistic message
                // This prevents double-render (optimistic + real message)
                if (message.clientMessageId) {
                  // Look for optimistic message by ID (optimistic messages use clientMessageId as their ID)
                  const optimisticIndex = oldData.findIndex(m => 
                    m.id === message.clientMessageId || m.clientMessageId === message.clientMessageId
                  );
                  if (optimisticIndex !== -1) {
                    console.log('[WebSocket] 🔄 找到乐观消息，执行替换', {
                      clientMessageId: message.clientMessageId,
                      optimisticIndex,
                      oldMessage: {
                        id: oldData[optimisticIndex].id,
                        status: oldData[optimisticIndex].status,
                      },
                      newMessage: {
                        id: message.id,
                        status: message.status,
                      },
                    });
                    // Replace optimistic message with real message (in-place)
                    const newData = [...oldData];
                    newData[optimisticIndex] = message;
                    console.log('[WebSocket] ✅ 替换完成，新缓存长度:', newData.length);
                    return newData;
                  } else {
                    console.log('[WebSocket] ⚠️ 未找到匹配的乐观消息', {
                      clientMessageId: message.clientMessageId,
                      existingClientMessageIds: oldData.map(m => m.clientMessageId).filter(Boolean),
                      existingIds: oldData.map(m => m.id).slice(0, 5),
                    });
                  }
                }
                
                // AI消息直接添加到缓存，立即显示
                // 后端已经按 persona.responseDelay 间隔发送，前端不需要额外队列
                if (message.senderType === 'ai') {
                  console.log('[WebSocket] 📨 收到AI消息，立即添加到缓存', {
                    messageId: message.id,
                    content: message.content?.substring(0, 30),
                    isInThisChat,
                  });
                }
                
                console.log('[WebSocket] ➕ 添加新消息到缓存', { messageId: message.id });
                // Backend returns DESC (newest first), prepend to maintain DESC order
                const newData = [message, ...oldData];
                console.log('[WebSocket] ✅ 添加完成，新缓存长度:', newData.length);
                return newData;
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
                    const oldUnreadCount = conv.unreadCount || 0;
                    const newUnreadCount = shouldIncrement ? oldUnreadCount + 1 : oldUnreadCount;
                    
                    console.log('[未读计数] 📊 更新对话未读数', {
                      conversationId: conv.id,
                      conversationTitle: conv.title,
                      isInThisChat,
                      messageType: message.senderType,
                      shouldIncrement,
                      oldUnreadCount,
                      newUnreadCount,
                      messageId: message.id,
                      messageContent: message.content?.substring(0, 20),
                    });
                    
                    return {
                      ...conv,
                      lastMessageAt: new Date().toISOString(),
                      lastMessage: message,
                      unreadCount: newUnreadCount,
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
                console.log('[WebSocket] ⏱️ AI流式响应超时完成', {
                  conversationId: message.conversationId,
                  timeout: '5s',
                });
              }, 5000);
              
              // CRITICAL FIX: If user is viewing this chat, mark messages as read immediately
              // This prevents unread count from showing when user exits the chat
              if (isInThisChat) {
                console.log('[WebSocket] 👁️ 用户正在查看此聊天，立即标记消息为已读');
                // Call mark as read API
                fetch(`/api/conversations/${message.conversationId}/read`, {
                  method: 'POST',
                  credentials: 'include',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({}),
                }).catch(error => {
                  console.error('[WebSocket] 标记已读失败:', error);
                });
              }
            }
          }
          
          // Handle Moments events
          else if (data.type === 'moment_created' && data.payload) {
            console.log('[WebSocket] 📸 动态创建事件，刷新动态列表');
            // Invalidate moments list to show new moment
            queryClient.invalidateQueries({ queryKey: ["/api/moments"] });
          }
          else if (data.type === 'moment_deleted' && data.payload) {
            console.log('[WebSocket] 🗑️ 动态删除事件，刷新动态列表');
            // Invalidate moments list to remove deleted moment
            queryClient.invalidateQueries({ queryKey: ["/api/moments"] });
          }
          else if (data.type === 'moment_liked' && data.payload) {
            console.log('[WebSocket] ❤️ 动态点赞事件，刷新动态列表');
            // Invalidate moments list to update like count
            queryClient.invalidateQueries({ queryKey: ["/api/moments"] });
          }
          else if (data.type === 'moment_commented' && data.payload) {
            console.log('[WebSocket] 💬 动态评论事件，刷新动态和评论');
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
            console.log('[WebSocket] 👥 群组创建事件，刷新对话列表');
            // Invalidate conversations list to show new group
            queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
          }
          else if (data.type === 'group_participant_added' && data.payload) {
            console.log('[WebSocket] ➕ 成员添加事件，刷新对话详情');
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
            console.log('[WebSocket] ➖ 成员移除事件，刷新对话详情');
            const { conversationId } = data.payload;
            // Invalidate specific conversation details
            if (conversationId) {
              queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId] });
              queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId, "participants"] });
            }
            // Also invalidate conversations list
            queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
          }

          // Control signals (multi-device sync)
          else if (data.type === 'conversation_read' && data.payload?.conversationId) {
            const { conversationId } = data.payload;
            console.log('[WebSocket] ✅ 对话已读同步', { conversationId });
            queryClient.setQueryData(
              ["/api/conversations"],
              (old: any[] = []) => old.map(c => c.id === conversationId ? { ...c, unreadCount: 0 } : c)
            );
          }
          else if (data.type === 'conversation_deleted' && data.payload?.conversationId) {
            const { conversationId } = data.payload;
            console.log('[WebSocket] 🗑️ 对话删除同步', { conversationId });
            queryClient.setQueryData(
              ["/api/conversations"],
              (old: any[] = []) => old.filter(c => c.id !== conversationId)
            );
            // Also clear message caches for this conversation
            queryClient.removeQueries({ queryKey: ["/api/messages", conversationId] });
            queryClient.removeQueries({ queryKey: ["/api/messages/all", conversationId] });
          }
        } catch (error) {
          console.error('[WebSocket] ❌ 消息解析错误', { error });
        }
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] ⚠️ 连接错误', { error });
      };

      ws.onclose = () => {
        console.log('[WebSocket] 🔌 连接断开');
        
        // Only reconnect if we should (component not unmounted)
        if (shouldReconnect) {
          console.log('[WebSocket] 📅 3秒后重连...');
          reconnectTimeoutRef.current = setTimeout(() => {
            // Check auth status before reconnecting
            fetch('/api/auth/user', { credentials: 'include' })
              .then(res => {
                if (res.ok) {
                  // User is logged in, safe to reconnect
                  console.log('[WebSocket] ✅ 用户已登录，重新连接');
                  connect();
                } else if (res.status === 401) {
                  // User is logged out (401 Unauthorized), stop reconnecting
                  console.log('[WebSocket] ❌ 用户未登录（401），停止重连');
                  shouldReconnect = false;
                } else {
                  // Other HTTP errors (5xx, network issues) - keep retrying
                  console.log(`[WebSocket] ⚠️ 认证检查返回${res.status}，继续尝试重连`);
                  connect();
                }
              })
              .catch((error) => {
                // Network errors or timeouts - keep retrying
                console.log('[WebSocket] ⚠️ 认证检查网络错误，继续尝试重连:', error.message);
                connect();
              });
          }, 3000);
        } else {
          console.log('[WebSocket] 🛑 停止重连（组件已卸载）');
        }
      };
    }

    connect();

    // Handle page visibility changes to ensure connection stays alive
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('[WebSocket] 👁️ 页面回到前台');
        
        // Check if WebSocket is still connected
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          console.log('[WebSocket] 🔄 连接已断开，重新连接');
          connect();
        }
        
        // Invalidate queries to fetch any missed updates
        console.log('[WebSocket] 🔄 刷新数据缓存');
        queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
        queryClient.invalidateQueries({ queryKey: ["/api/moments"] });
        
        // If viewing a specific conversation, refresh its messages
        // @ts-ignore - Read from window object
        const currentConversationId = window.__currentConversationId;
        if (currentConversationId) {
          queryClient.invalidateQueries({ 
            queryKey: ["/api/messages", currentConversationId] 
          });
        }
      } else {
        console.log('[WebSocket] 👁️ 页面进入后台');
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup: stop reconnection and close connection
    return () => {
      shouldReconnect = false;  // Prevent reconnection after cleanup
      
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      
      if (heartbeatIntervalRef.current) {
        clearTimeout(heartbeatIntervalRef.current);
      }
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
        console.log('[WebSocket] 👀 加入对话', { conversationId });
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
        console.log('[WebSocket] 👋 离开对话', { conversationId });
      }
    };
  }, [wsRef, conversationId]);
}
