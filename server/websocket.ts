import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { parse } from 'cookie';
import { IncomingMessage } from 'http';
import { sessionStore } from './replitAuth';
import { storage } from './storage';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  conversationId?: string;
}

interface WSMessage {
  type: 'message' | 'typing' | 'read' | 'join_conversation' | 'leave_conversation';
  payload: any;
}

// Track connected clients by userId
const userConnections = new Map<string, Set<AuthenticatedWebSocket>>();

// Track conversation participants
const conversationConnections = new Map<string, Set<AuthenticatedWebSocket>>();

/**
 * Setup WebSocket server with authentication
 */
export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ 
    server,
    path: '/ws',
  });

  wss.on('connection', async (ws: AuthenticatedWebSocket, req: IncomingMessage) => {
    console.log('New WebSocket connection attempt');

    try {
      // Authenticate WebSocket connection using session cookie
      const cookies = req.headers.cookie ? parse(req.headers.cookie) : {};
      const sessionId = cookies['connect.sid'];

      if (!sessionId) {
        console.log('No session ID in WebSocket connection');
        ws.close(1008, 'Authentication required');
        return;
      }

      // Extract session ID from signed cookie
      const sid = sessionId.startsWith('s:') ? sessionId.slice(2).split('.')[0] : sessionId;

      // Get session from store
      const sessionData = await new Promise<any>((resolve, reject) => {
        sessionStore.get(sid, (err: any, session: any) => {
          if (err) reject(err);
          else resolve(session);
        });
      });

      if (!sessionData || !sessionData.passport || !sessionData.passport.user) {
        console.log('Invalid session or user not authenticated');
        ws.close(1008, 'Authentication required');
        return;
      }

      // Get userId from session
      const userId = sessionData.passport.user.claims.sub;
      ws.userId = userId;

      console.log(`WebSocket authenticated for user: ${userId}`);

      // Track user connection
      if (!userConnections.has(userId)) {
        userConnections.set(userId, new Set());
      }
      userConnections.get(userId)!.add(ws);

      // Send connection confirmation
      ws.send(JSON.stringify({
        type: 'connection',
        payload: { userId, connected: true }
      }));

      // Handle incoming messages
      ws.on('message', async (data: Buffer) => {
        try {
          const message: WSMessage = JSON.parse(data.toString());
          await handleWebSocketMessage(ws, message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
          ws.send(JSON.stringify({
            type: 'error',
            payload: { message: 'Invalid message format' }
          }));
        }
      });

      // Handle disconnection
      ws.on('close', () => {
        console.log(`WebSocket disconnected for user: ${userId}`);
        
        // Remove from user connections
        const userConns = userConnections.get(userId);
        if (userConns) {
          userConns.delete(ws);
          if (userConns.size === 0) {
            userConnections.delete(userId);
          }
        }

        // Remove from conversation connections
        if (ws.conversationId) {
          const convConns = conversationConnections.get(ws.conversationId);
          if (convConns) {
            convConns.delete(ws);
            if (convConns.size === 0) {
              conversationConnections.delete(ws.conversationId);
            }
          }
        }
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });

    } catch (error) {
      console.error('Error authenticating WebSocket:', error);
      ws.close(1011, 'Server error');
    }
  });

  console.log('WebSocket server initialized');
  return wss;
}

/**
 * Handle incoming WebSocket messages
 */
async function handleWebSocketMessage(ws: AuthenticatedWebSocket, message: WSMessage) {
  const { type, payload } = message;

  switch (type) {
    case 'join_conversation':
      await handleJoinConversation(ws, payload.conversationId);
      break;

    case 'leave_conversation':
      handleLeaveConversation(ws);
      break;

    case 'typing':
      handleTyping(ws, payload);
      break;

    case 'read':
      handleRead(ws, payload);
      break;

    default:
      ws.send(JSON.stringify({
        type: 'error',
        payload: { message: `Unknown message type: ${type}` }
      }));
  }
}

/**
 * Join a conversation room (with authorization check)
 */
async function handleJoinConversation(ws: AuthenticatedWebSocket, conversationId: string) {
  try {
    // Verify user has access to this conversation
    const conversation = await storage.getConversation(conversationId);
    
    if (!conversation) {
      ws.send(JSON.stringify({
        type: 'error',
        payload: { message: 'Conversation not found' }
      }));
      return;
    }
    
    // Check if user owns the conversation
    // Note: conversation_participants only tracks AI personas, not human users
    // The human user is always the conversation owner (conversation.userId)
    if (conversation.userId !== ws.userId) {
      console.log(`User ${ws.userId} unauthorized to join conversation ${conversationId}`);
      ws.send(JSON.stringify({
        type: 'error',
        payload: { message: 'Unauthorized: You do not own this conversation' }
      }));
      ws.close(1008, 'Unauthorized');
      return;
    }
    
    // Leave current conversation if any
    if (ws.conversationId) {
      handleLeaveConversation(ws);
    }

    ws.conversationId = conversationId;

    // Add to conversation connections
    if (!conversationConnections.has(conversationId)) {
      conversationConnections.set(conversationId, new Set());
    }
    conversationConnections.get(conversationId)!.add(ws);

    console.log(`User ${ws.userId} joined conversation ${conversationId}`);

    ws.send(JSON.stringify({
      type: 'joined_conversation',
      payload: { conversationId }
    }));
  } catch (error) {
    console.error('Error joining conversation:', error);
    ws.send(JSON.stringify({
      type: 'error',
      payload: { message: 'Failed to join conversation' }
    }));
  }
}

/**
 * Leave current conversation
 */
function handleLeaveConversation(ws: AuthenticatedWebSocket) {
  if (!ws.conversationId) return;

  const convConns = conversationConnections.get(ws.conversationId);
  if (convConns) {
    convConns.delete(ws);
    if (convConns.size === 0) {
      conversationConnections.delete(ws.conversationId);
    }
  }

  console.log(`User ${ws.userId} left conversation ${ws.conversationId}`);
  
  ws.conversationId = undefined;
}

/**
 * Handle typing indicator
 */
function handleTyping(ws: AuthenticatedWebSocket, payload: { conversationId: string; isTyping: boolean; personaId?: string }) {
  const { conversationId, isTyping, personaId } = payload;

  // Broadcast to all users in the conversation except sender
  const convConns = conversationConnections.get(conversationId);
  if (convConns) {
    convConns.forEach(client => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'typing',
          payload: {
            userId: ws.userId,
            conversationId,
            isTyping,
            personaId,
          }
        }));
      }
    });
  }
}

/**
 * Handle message read status
 */
function handleRead(ws: AuthenticatedWebSocket, payload: { messageId: number; conversationId: string }) {
  const { messageId, conversationId } = payload;

  // Broadcast to all conversation participants
  broadcastConversationUpdate(conversationId, {
    type: 'message_read',
    messageId,
    userId: ws.userId,
    conversationId
  });
  
  // Also sync to all user's own devices
  broadcastToUser(ws.userId!, {
    type: 'message_read',
    payload: { messageId, conversationId, userId: ws.userId }
  });
}

/**
 * Broadcast new message to all devices for conversation participants
 * This ensures messages are received even when users are not in the chat page
 */
export async function broadcastNewMessage(conversationId: string, message: any) {
  // Debug: Log message with persona info
  console.log('[WS Broadcast] Message:', {
    id: message.id,
    senderType: message.senderType,
    personaName: message.personaName,
    personaAvatar: message.personaAvatar,
    content: message.content?.substring(0, 20)
  });
  
  const data = JSON.stringify({
    type: 'new_message',
    payload: message
  });

  // Method 1: Broadcast to connections actively in the conversation
  const convConns = conversationConnections.get(conversationId);
  if (convConns) {
    convConns.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }
  
  // Method 2: Also broadcast to ALL devices of conversation owner (user)
  // This ensures messages are received even if user navigated away from chat
  try {
    const conversation = await storage.getConversation(conversationId);
    if (conversation && conversation.userId) {
      // Broadcast to all devices of the conversation owner
      const userConns = userConnections.get(conversation.userId);
      if (userConns) {
        userConns.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(data);
          }
        });
      }
    }
  } catch (error) {
    console.error('[WS Broadcast] Error broadcasting to user:', error);
  }
}

/**
 * Broadcast to all devices for a specific user
 */
export function broadcastToUser(userId: string, data: any) {
  const userConns = userConnections.get(userId);
  if (userConns) {
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    
    userConns.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}

/**
 * Broadcast conversation update to all participants
 */
export function broadcastConversationUpdate(conversationId: string, update: any) {
  const convConns = conversationConnections.get(conversationId);
  if (convConns) {
    const data = JSON.stringify({
      type: 'conversation_update',
      payload: update
    });

    convConns.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }
}
