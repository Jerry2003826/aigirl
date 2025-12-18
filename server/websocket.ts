import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { parse } from 'cookie';
import { IncomingMessage } from 'http';
import { sessionStore } from './routes';
import { storage } from './storage';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  conversationId?: string;
  deviceType?: string;
  deviceId?: string;
}

interface WSMessage {
  type:
    | 'message'
    | 'typing'
    | 'read'
    | 'join_conversation'
    | 'leave_conversation'
    | 'ping'
    | 'hello'
    | 'call_invite'
    | 'call_accept'
    | 'call_reject'
    | 'call_offer'
    | 'call_answer'
    | 'call_candidate'
    | 'call_hangup';
  payload?: any;
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
    perMessageDeflate: false, // avoid RSV1/compression issues behind proxies
  });

  wss.on('connection', async (ws: AuthenticatedWebSocket, req: IncomingMessage) => {
    console.log('New WebSocket connection attempt');

    try {
      // Parse device info from query string: /ws?deviceType=web&deviceId=xxx
      try {
        const base = `http://${req.headers.host || 'localhost'}`;
        const url = new URL(req.url || '/ws', base);
        ws.deviceType = url.searchParams.get('deviceType') || 'unknown';
        ws.deviceId = url.searchParams.get('deviceId') || undefined;
      } catch {
        ws.deviceType = 'unknown';
      }

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

      if (!sessionData || !sessionData.user || !sessionData.user.id) {
        console.log('Invalid session or user not authenticated');
        ws.close(1008, 'Authentication required');
        return;
      }

      // Get userId from session
      const userId = sessionData.user.id;
      ws.userId = userId;

      console.log(`WebSocket authenticated for user: ${userId}`, {
        deviceType: ws.deviceType,
        deviceId: ws.deviceId,
      });

      // Track user connection
      if (!userConnections.has(userId)) {
        userConnections.set(userId, new Set());
      }
      userConnections.get(userId)!.add(ws);

      // Send connection confirmation
      ws.send(JSON.stringify({
        type: 'connection',
        payload: { userId, connected: true, deviceType: ws.deviceType, deviceId: ws.deviceId }
      }));

      // Initial sync hint: client should refresh state via HTTP APIs.
      // Keep payload minimal to avoid heavy DB work on every reconnect.
      ws.send(JSON.stringify({
        type: 'sync_state',
        payload: {
          userId,
          deviceType: ws.deviceType,
          deviceId: ws.deviceId,
          serverTime: new Date().toISOString(),
        }
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
    case 'ping':
      // Respond to heartbeat ping with pong
      ws.send(JSON.stringify({ type: 'pong' }));
      break;

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

    case 'hello':
      // Optional client handshake to set/override device info
      if (payload?.deviceType) ws.deviceType = String(payload.deviceType);
      if (payload?.deviceId) ws.deviceId = String(payload.deviceId);
      ws.send(JSON.stringify({
        type: 'hello_ack',
        payload: { deviceType: ws.deviceType, deviceId: ws.deviceId }
      }));
      break;

    case 'call_invite':
      await handleCallInvite(ws, payload);
      break;
    case 'call_accept':
      await handleCallAccept(ws, payload);
      break;
    case 'call_reject':
      await handleCallReject(ws, payload);
      break;
    case 'call_offer':
      await handleCallOffer(ws, payload);
      break;
    case 'call_answer':
      await handleCallAnswer(ws, payload);
      break;
    case 'call_candidate':
      await handleCallCandidate(ws, payload);
      break;
    case 'call_hangup':
      await handleCallHangup(ws, payload);
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
    clientMessageId: message.clientMessageId, // CRITICAL DEBUG
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
  const sentToClients = new Set<WebSocket>();
  
  if (convConns) {
    convConns.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
        sentToClients.add(client);
      }
    });
  }
  
  // Method 2: Also broadcast to ALL devices of conversation owner (user)
  // This ensures messages are received even if user navigated away from chat
  // IMPORTANT: Skip clients that already received the message in Method 1
  try {
    const conversation = await storage.getConversation(conversationId);
    if (conversation && conversation.userId) {
      // Broadcast to all devices of the conversation owner
      const userConns = userConnections.get(conversation.userId);
      if (userConns) {
        userConns.forEach(client => {
          // Skip if this client already received the message
          if (client.readyState === WebSocket.OPEN && !sentToClients.has(client)) {
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
 * Broadcast an event ONLY to the owner user's devices (multi-device sync).
 * This prevents cross-user leakage.
 */
export function broadcastToUserEvent(userId: string, type: string, payload: any) {
  broadcastToUser(userId, { type, payload });
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

/**
 * Broadcast to all connected users (legacy)
 */
export function broadcastToAllUsers(data: any) {
  const message = typeof data === 'string' ? data : JSON.stringify(data);
  
  userConnections.forEach((userConns) => {
    userConns.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  });
}

/**
 * Broadcast moment events (scoped to the owner user)
 */
export function broadcastMomentEvent(userId: string, eventType: 'created' | 'liked' | 'commented' | 'deleted', payload: any) {
  broadcastToUserEvent(userId, `moment_${eventType}`, payload);
}

/**
 * Broadcast group/conversation events (scoped to the owner user)
 */
export function broadcastGroupEvent(userId: string, eventType: 'created' | 'updated' | 'participant_added' | 'participant_removed', payload: any) {
  broadcastToUserEvent(userId, `group_${eventType}`, payload);
}

// Track active calls: callId -> { callerId, calleeId, conversationId }
const activeCalls = new Map<string, { callerId: string; calleeId: string; conversationId: string }>();

/** Handle call invite */
async function handleCallInvite(ws: AuthenticatedWebSocket, payload: { callId: string; calleeId: string; conversationId: string; withVideo?: boolean }) {
  const { callId, calleeId, conversationId, withVideo } = payload || {};
  const callerId = ws.userId!;
  if (!callId || !calleeId || !conversationId) {
    ws.send(JSON.stringify({ type: 'error', payload: { message: 'Missing callId/calleeId/conversationId' } }));
    return;
  }
  try {
    const conversation = await storage.getConversation(conversationId);
    if (!conversation || (conversation.userId !== callerId && conversation.userId !== calleeId)) {
      ws.send(JSON.stringify({ type: 'error', payload: { message: 'Unauthorized conversation' } }));
      return;
    }
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', payload: { message: 'Failed to verify conversation' } }));
    return;
  }
  activeCalls.set(callId, { callerId, calleeId, conversationId });
  broadcastToUser(calleeId, { type: 'call_invite', payload: { callId, callerId, conversationId, withVideo: !!withVideo } });
  ws.send(JSON.stringify({ type: 'call_invite_sent', payload: { callId, calleeId } }));
}

async function handleCallAccept(ws: AuthenticatedWebSocket, payload: { callId: string }) {
  const { callId } = payload || {};
  const calleeId = ws.userId!;
  const call = activeCalls.get(callId);
  if (!call || call.calleeId !== calleeId) {
    ws.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid call or unauthorized' } }));
    return;
  }
  broadcastToUser(call.callerId, { type: 'call_accepted', payload: { callId, calleeId } });
  ws.send(JSON.stringify({ type: 'call_accept_confirmed', payload: { callId } }));
}

async function handleCallReject(ws: AuthenticatedWebSocket, payload: { callId: string }) {
  const { callId } = payload || {};
  const calleeId = ws.userId!;
  const call = activeCalls.get(callId);
  if (!call || call.calleeId !== calleeId) return;
  broadcastToUser(call.callerId, { type: 'call_rejected', payload: { callId, calleeId } });
  activeCalls.delete(callId);
}

async function handleCallOffer(ws: AuthenticatedWebSocket, payload: { callId: string; offer: any }) {
  const { callId, offer } = payload || {};
  const userId = ws.userId!;
  const call = activeCalls.get(callId);
  if (!call || (call.callerId !== userId && call.calleeId !== userId)) return;
  const peerId = call.callerId === userId ? call.calleeId : call.callerId;
  broadcastToUser(peerId, { type: 'call_offer', payload: { callId, offer, fromUserId: userId } });
}

async function handleCallAnswer(ws: AuthenticatedWebSocket, payload: { callId: string; answer: any }) {
  const { callId, answer } = payload || {};
  const userId = ws.userId!;
  const call = activeCalls.get(callId);
  if (!call || (call.callerId !== userId && call.calleeId !== userId)) return;
  const peerId = call.callerId === userId ? call.calleeId : call.callerId;
  broadcastToUser(peerId, { type: 'call_answer', payload: { callId, answer, fromUserId: userId } });
}

async function handleCallCandidate(ws: AuthenticatedWebSocket, payload: { callId: string; candidate: any }) {
  const { callId, candidate } = payload || {};
  const userId = ws.userId!;
  const call = activeCalls.get(callId);
  if (!call || (call.callerId !== userId && call.calleeId !== userId)) return;
  const peerId = call.callerId === userId ? call.calleeId : call.callerId;
  broadcastToUser(peerId, { type: 'call_candidate', payload: { callId, candidate, fromUserId: userId } });
}

async function handleCallHangup(ws: AuthenticatedWebSocket, payload: { callId: string }) {
  const { callId } = payload || {};
  const userId = ws.userId!;
  const call = activeCalls.get(callId);
  if (!call || (call.callerId !== userId && call.calleeId !== userId)) return;
  const peerId = call.callerId === userId ? call.calleeId : call.callerId;
  broadcastToUser(peerId, { type: 'call_hangup', payload: { callId, fromUserId: userId } });
  activeCalls.delete(callId);
}
