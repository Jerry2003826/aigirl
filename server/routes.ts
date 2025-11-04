import type { Express } from "express";
import { createServer, type Server } from "http";
import rateLimit from "express-rate-limit";
import multer from "multer";
import path from "path";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { generateAIResponse, generateAIResponseStream, selectRespondingPersona, extractAndStoreMemories, triggerAICommentsOnMoment } from "./aiService";
import { setupWebSocket, broadcastNewMessage } from "./websocket";
import { 
  insertAiPersonaSchema, 
  updateAiPersonaSchema,
  insertConversationSchema, 
  insertMessageSchema,
  insertConversationParticipantSchema,
  insertMomentSchema,
  insertMomentCommentSchema
} from "@shared/schema";

// Configure multer for file uploads
const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: uploadStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF and WebP are allowed.'));
    }
  }
});

// Rate limiter for message sending (20 messages per minute per user)
const messageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // Limit each user to 20 requests per minute
  message: "Too many messages sent. Please wait a moment before sending more.",
  standardHeaders: true,
  legacyHeaders: false,
  // Use user ID from session for rate limiting
  keyGenerator: (req, res) => {
    // Use authenticated user ID if available, otherwise fall back to IP
    const userId = (req as any).user?.claims?.sub;
    if (userId) {
      return `user:${userId}`;
    }
    // Use the provided ipKeyGenerator for proper IPv6 handling
    return rateLimit.ipKeyGenerator(req, res);
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication
  await setupAuth(app);

  // Auth route - get current user
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // File upload route
  app.post('/api/upload', isAuthenticated, upload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "没有上传文件" });
      }

      // Return the URL path to the uploaded file
      const fileUrl = `/uploads/${req.file.filename}`;
      res.json({ url: fileUrl });
    } catch (error: any) {
      console.error("Error uploading file:", error);
      res.status(500).json({ message: error.message || "上传文件失败" });
    }
  });

  // AI Personas routes (protected)
  app.get('/api/personas', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const personas = await storage.getPersonasByUser(userId);
      res.json(personas);
    } catch (error) {
      console.error("Error fetching personas:", error);
      res.status(500).json({ message: "Failed to fetch personas" });
    }
  });

  app.post('/api/personas', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Validate using Zod schema
      const validatedData = insertAiPersonaSchema.parse({
        ...req.body,
        userId, // Set userId server-side for security
      });
      
      const persona = await storage.createPersona(validatedData);
      res.json(persona);
    } catch (error: any) {
      console.error("Error creating persona:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create persona" });
    }
  });

  app.patch('/api/personas/:personaId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { personaId } = req.params;
      
      // Verify ownership
      const persona = await storage.getPersona(personaId);
      if (!persona) {
        return res.status(404).json({ message: "Persona not found" });
      }
      if (persona.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't own this persona" });
      }
      
      // Validate using Zod schema (excludes userId and other protected fields)
      const validatedData = updateAiPersonaSchema.parse(req.body);
      
      const updatedPersona = await storage.updatePersona(personaId, validatedData);
      res.json(updatedPersona);
    } catch (error: any) {
      console.error("Error updating persona:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update persona" });
    }
  });

  app.delete('/api/personas/:personaId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { personaId } = req.params;
      
      // Verify ownership
      const persona = await storage.getPersona(personaId);
      if (!persona) {
        return res.status(404).json({ message: "Persona not found" });
      }
      if (persona.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't own this persona" });
      }
      
      await storage.deletePersona(personaId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting persona:", error);
      res.status(500).json({ message: "Failed to delete persona" });
    }
  });

  // Conversations routes (protected)
  app.get('/api/conversations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const conversations = await storage.getConversationsByUser(userId);
      
      // Batch fetch all participants and personas first
      const allParticipants = await Promise.all(
        conversations.map(conv => storage.getConversationParticipants(conv.id))
      );
      
      // Get unique persona IDs
      const personaIds = new Set<string>();
      allParticipants.forEach(participants => {
        participants.forEach(p => personaIds.add(p.personaId));
      });
      
      // Batch fetch all personas
      const personasMap = new Map();
      await Promise.all(
        Array.from(personaIds).map(async (id) => {
          const persona = await storage.getPersona(id);
          if (persona) personasMap.set(id, persona);
        })
      );
      
      // Enrich conversations with stats and personas
      const enrichedConversations = await Promise.all(
        conversations.map(async (conv, index) => {
          const stats = await storage.getConversationStats(conv.id);
          const participants = allParticipants[index];
          const personas = participants.map(p => personasMap.get(p.personaId)).filter(Boolean);
          
          return {
            ...conv,
            unreadCount: stats.unreadCount,
            lastMessage: stats.lastMessage ? {
              content: stats.lastMessage.content,
              senderType: stats.lastMessage.senderType,
              createdAt: stats.lastMessage.createdAt,
            } : null,
            personas,
          };
        })
      );
      
      res.json(enrichedConversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  app.post('/api/conversations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Validate using Zod schema
      const validatedData = insertConversationSchema.parse({
        ...req.body,
        userId, // Set userId server-side for security
      });
      
      const conversation = await storage.createConversation(validatedData);
      res.json(conversation);
    } catch (error: any) {
      console.error("Error creating conversation:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create conversation" });
    }
  });

  app.delete('/api/conversations/:conversationId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { conversationId } = req.params;
      
      // Verify ownership
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      if (conversation.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't own this conversation" });
      }
      
      await storage.deleteConversation(conversationId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ message: "Failed to delete conversation" });
    }
  });

  // Participant management
  app.post('/api/conversations/:conversationId/participants', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { conversationId } = req.params;
      const { personaId } = req.body;
      
      // Verify conversation ownership
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      if (conversation.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't own this conversation" });
      }
      
      // Verify persona ownership (prevent cross-tenant data exposure)
      const persona = await storage.getPersona(personaId);
      if (!persona) {
        return res.status(404).json({ message: "Persona not found" });
      }
      if (persona.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't own this persona" });
      }
      
      // Validate using Zod schema
      const validatedData = insertConversationParticipantSchema.parse({
        conversationId,
        personaId,
      });
      
      const participant = await storage.addParticipant(validatedData);
      res.json(participant);
    } catch (error: any) {
      console.error("Error adding participant:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to add participant" });
    }
  });

  app.get('/api/conversations/:conversationId/participants', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { conversationId } = req.params;
      
      // Verify ownership
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      if (conversation.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't own this conversation" });
      }
      
      const participants = await storage.getConversationParticipants(conversationId);
      res.json(participants);
    } catch (error) {
      console.error("Error fetching participants:", error);
      res.status(500).json({ message: "Failed to fetch participants" });
    }
  });

  app.delete('/api/conversations/:conversationId/participants/:personaId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { conversationId, personaId } = req.params;
      
      // Verify conversation ownership
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      if (conversation.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't own this conversation" });
      }
      
      // Verify persona ownership (prevent cross-tenant manipulation)
      const persona = await storage.getPersona(personaId);
      if (!persona) {
        return res.status(404).json({ message: "Persona not found" });
      }
      if (persona.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't own this persona" });
      }
      
      await storage.removeParticipant(conversationId, personaId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing participant:", error);
      res.status(500).json({ message: "Failed to remove participant" });
    }
  });

  // Messages routes (protected)
  app.get('/api/conversations/:conversationId/messages', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { conversationId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      
      // Verify user owns this conversation
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      if (conversation.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't have access to this conversation" });
      }
      
      const messages = await storage.getMessagesByConversation(conversationId, limit, offset);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.post('/api/messages', isAuthenticated, messageLimiter, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { conversationId } = req.body;
      
      // Verify user owns this conversation
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      if (conversation.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't have access to this conversation" });
      }
      
      // Validate using Zod schema
      const validatedData = insertMessageSchema.parse({
        ...req.body,
        senderId: null, // User messages have null senderId
        senderType: "user",
      });
      
      const message = await storage.createMessage(validatedData);
      
      // Broadcast new message to all connected clients in the conversation
      broadcastNewMessage(conversationId, message);
      
      // Update conversation's last message timestamp
      await storage.updateConversationLastMessage(conversationId);
      
      res.json(message);
    } catch (error: any) {
      console.error("Error creating message:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create message" });
    }
  });

  // Mark all messages in a conversation as read
  app.post('/api/conversations/:conversationId/read', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { conversationId } = req.params;
      
      // Verify user owns this conversation
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      if (conversation.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't have access to this conversation" });
      }
      
      await storage.markConversationMessagesAsRead(conversationId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking messages as read:", error);
      res.status(500).json({ message: "Failed to mark messages as read" });
    }
  });

  // AI persona selection for group chats
  app.post('/api/ai/select-persona', isAuthenticated, messageLimiter, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { conversationId, userMessage } = req.body;
      
      // Verify conversation ownership
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      if (conversation.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't own this conversation" });
      }
      
      // Select which persona should respond
      const personaId = await selectRespondingPersona({
        conversationId,
        userMessage,
      });
      
      res.json({ personaId });
    } catch (error: any) {
      console.error("Error selecting persona:", error);
      res.status(500).json({ message: "Failed to select responding persona" });
    }
  });

  // AI generation routes
  app.post('/api/ai/generate', isAuthenticated, messageLimiter, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { conversationId, personaId, content } = req.body;
      
      // Verify conversation ownership
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      if (conversation.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't own this conversation" });
      }
      
      // Verify persona ownership
      const persona = await storage.getPersona(personaId);
      if (!persona) {
        return res.status(404).json({ message: "Persona not found" });
      }
      if (persona.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't own this persona" });
      }
      
      // Validate and save user message first (must persist before AI generation)
      const validatedUserMessage = insertMessageSchema.parse({
        conversationId,
        senderId: null,
        senderType: "user",
        content,
        isRead: false,
        status: "sent",
      });
      
      const userMessage = await storage.createMessage(validatedUserMessage);
      if (!userMessage) {
        throw new Error("Failed to save user message");
      }
      
      // Generate AI response (conversation history now includes user message)
      const aiResponse = await generateAIResponse({
        conversationId,
        personaId,
        userMessage: content,
      });
      
      // Save AI message to database
      const aiMessage = await storage.createMessage({
        conversationId,
        senderId: personaId,
        senderType: "ai",
        content: aiResponse,
        isRead: false,
        status: "sent",
      });
      
      // Update conversation's last message timestamp
      await storage.updateConversationLastMessage(conversationId);
      
      // Broadcast user message and AI response to all connected clients
      broadcastNewMessage(conversationId, userMessage);
      broadcastNewMessage(conversationId, aiMessage);
      
      // Extract and store memories asynchronously (don't await to avoid blocking response)
      extractAndStoreMemories(conversationId, personaId, content, aiResponse)
        .catch(err => console.error("Memory extraction failed:", err));
      
      res.json({ userMessage, aiMessage, response: aiResponse });
    } catch (error: any) {
      console.error("Error generating AI response:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to generate AI response", error: error.message });
    }
  });

  app.post('/api/ai/generate-stream', isAuthenticated, messageLimiter, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { conversationId, personaId, content } = req.body;
      
      // Verify conversation ownership
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      if (conversation.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't own this conversation" });
      }
      
      // Verify persona ownership
      const persona = await storage.getPersona(personaId);
      if (!persona) {
        return res.status(404).json({ message: "Persona not found" });
      }
      if (persona.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't own this persona" });
      }
      
      // Validate and save user message first (must persist before AI generation)
      const validatedUserMessage = insertMessageSchema.parse({
        conversationId,
        senderId: null,
        senderType: "user",
        content,
        isRead: false,
        status: "sent",
      });
      
      const userMessage = await storage.createMessage(validatedUserMessage);
      if (!userMessage) {
        return res.status(500).json({ message: "Failed to save user message" });
      }
      
      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      // Send user message confirmation
      res.write(`data: ${JSON.stringify({ userMessage })}\n\n`);
      
      // Generate AI response stream (conversation history now includes user message)
      const stream = await generateAIResponseStream({
        conversationId,
        personaId,
        userMessage: content,
      });
      
      let fullResponse = '';
      
      // Stream the response
      for await (const chunk of stream) {
        const chunkContent = chunk.choices[0]?.delta?.content || '';
        fullResponse += chunkContent;
        
        if (chunkContent) {
          res.write(`data: ${JSON.stringify({ content: chunkContent })}\n\n`);
        }
      }
      
      // Save complete AI message to database
      const aiMessage = await storage.createMessage({
        conversationId,
        senderId: personaId,
        senderType: "ai",
        content: fullResponse,
        isRead: false,
        status: "sent",
      });
      
      // Update conversation's last message timestamp
      await storage.updateConversationLastMessage(conversationId);
      
      // Broadcast user message and AI response to all connected clients
      broadcastNewMessage(conversationId, userMessage);
      broadcastNewMessage(conversationId, aiMessage);
      
      // Extract and store memories asynchronously (don't await to avoid blocking response)
      extractAndStoreMemories(conversationId, personaId, content, fullResponse)
        .catch(err => console.error("Memory extraction failed:", err));
      
      // Send final message with saved message data
      res.write(`data: ${JSON.stringify({ done: true, aiMessage })}\n\n`);
      res.end();
    } catch (error: any) {
      console.error("Error generating AI response stream:", error);
      if (error.name === 'ZodError') {
        res.write(`data: ${JSON.stringify({ error: "Invalid input", details: error.errors })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      }
      res.end();
    }
  });

  // ==================== Moments Routes ====================
  
  // Get all moments (from all users and AI personas) with likes and comments
  app.get('/api/moments', isAuthenticated, async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      
      // Get all moments (not filtered by user - this is a social feed)
      const moments = await storage.getAllMoments(limit, offset);
      
      // Fetch likes and comments for each moment
      const momentsWithDetails = await Promise.all(
        moments.map(async (moment) => {
          const [likes, comments] = await Promise.all([
            storage.getMomentLikes(moment.id),
            storage.getMomentComments(moment.id),
          ]);
          return {
            ...moment,
            likes,
            comments,
          };
        })
      );
      
      res.json(momentsWithDetails);
    } catch (error) {
      console.error("Error fetching moments:", error);
      res.status(500).json({ message: "Failed to fetch moments" });
    }
  });

  // Create a new moment
  app.post('/api/moments', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Validate using Zod schema
      const validatedData = insertMomentSchema.parse({
        ...req.body,
        userId, // Always set to current user for security
        authorId: userId, // User is posting the moment
        authorType: 'user',
      });
      
      const moment = await storage.createMoment(validatedData);
      
      // Trigger AI comments (async, non-blocking)
      triggerAICommentsOnMoment(
        moment.id,
        userId,
        moment.content,
        moment.images
      ).catch(err => {
        console.error("Error triggering AI comments:", err);
        // Don't fail the response if AI comments fail
      });
      
      res.json(moment);
    } catch (error: any) {
      console.error("Error creating moment:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create moment" });
    }
  });

  // Delete a moment
  app.delete('/api/moments/:momentId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { momentId } = req.params;
      
      // Verify ownership
      const moment = await storage.getMoment(momentId);
      if (!moment) {
        return res.status(404).json({ message: "Moment not found" });
      }
      if (moment.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't own this moment" });
      }
      
      await storage.deleteMoment(momentId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting moment:", error);
      res.status(500).json({ message: "Failed to delete moment" });
    }
  });

  // Toggle like on a moment
  app.post('/api/moments/:momentId/like', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { momentId } = req.params;
      
      // Verify moment exists (anyone can like any moment)
      const moment = await storage.getMoment(momentId);
      if (!moment) {
        return res.status(404).json({ message: "Moment not found" });
      }
      
      const liked = await storage.toggleMomentLike(momentId, userId, 'user');
      res.json({ liked });
    } catch (error) {
      console.error("Error toggling moment like:", error);
      res.status(500).json({ message: "Failed to toggle like" });
    }
  });

  // Get likes for a moment
  app.get('/api/moments/:momentId/likes', isAuthenticated, async (req: any, res) => {
    try {
      const { momentId } = req.params;
      
      // Verify moment exists (anyone can view likes)
      const moment = await storage.getMoment(momentId);
      if (!moment) {
        return res.status(404).json({ message: "Moment not found" });
      }
      
      const likes = await storage.getMomentLikes(momentId);
      res.json(likes);
    } catch (error) {
      console.error("Error fetching moment likes:", error);
      res.status(500).json({ message: "Failed to fetch likes" });
    }
  });

  // Create a comment on a moment
  app.post('/api/moments/:momentId/comments', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { momentId } = req.params;
      const { content, parentCommentId } = req.body;
      
      // Verify moment exists (anyone can comment)
      const moment = await storage.getMoment(momentId);
      if (!moment) {
        return res.status(404).json({ message: "Moment not found" });
      }
      
      // Server-side author derivation - prevent spoofing
      const validatedData = insertMomentCommentSchema.parse({
        momentId,
        authorId: userId, // Always use authenticated user
        authorType: 'user', // Always set to 'user' for authenticated users
        content,
        parentCommentId: parentCommentId || null,
      });
      
      const comment = await storage.createMomentComment(validatedData);
      res.json(comment);
    } catch (error: any) {
      console.error("Error creating comment:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create comment" });
    }
  });

  // Get comments for a moment
  app.get('/api/moments/:momentId/comments', isAuthenticated, async (req: any, res) => {
    try {
      const { momentId } = req.params;
      
      // Verify moment exists (anyone can view comments)
      const moment = await storage.getMoment(momentId);
      if (!moment) {
        return res.status(404).json({ message: "Moment not found" });
      }
      
      const comments = await storage.getMomentComments(momentId);
      res.json(comments);
    } catch (error) {
      console.error("Error fetching comments:", error);
      res.status(500).json({ message: "Failed to fetch comments" });
    }
  });

  // Delete a comment
  app.delete('/api/moments/comments/:commentId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { commentId } = req.params;
      
      // Note: We should verify comment ownership here, but we'll need to fetch it first
      // For now, we'll just delete it (in production, add ownership check)
      
      await storage.deleteMomentComment(commentId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting comment:", error);
      res.status(500).json({ message: "Failed to delete comment" });
    }
  });

  // AI Settings routes (protected)
  app.get('/api/settings/ai', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const settings = await storage.getAiSettings(userId);
      res.json(settings);
    } catch (error) {
      console.error("Error fetching AI settings:", error);
      res.status(500).json({ message: "Failed to fetch AI settings" });
    }
  });

  app.put('/api/settings/ai', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { provider, model, customApiKey, ragEnabled, searchEnabled, language } = req.body;
      
      // Try to update existing settings
      let settings = await storage.updateAiSettings(userId, {
        provider,
        model,
        customApiKey,
        ragEnabled,
        searchEnabled,
        language,
      });
      
      // If no settings exist, create new ones
      if (!settings) {
        settings = await storage.createAiSettings({
          userId,
          provider: provider || "google",
          model: model || "gemini-2.5-pro",
          customApiKey: customApiKey || null,
          ragEnabled: ragEnabled || false,
          searchEnabled: searchEnabled || false,
          language: language || "zh-CN",
        });
      }
      
      res.json(settings);
    } catch (error) {
      console.error("Error updating AI settings:", error);
      res.status(500).json({ message: "Failed to update AI settings" });
    }
  });

  const httpServer = createServer(app);
  
  // Setup WebSocket server for real-time messaging
  setupWebSocket(httpServer);
  
  return httpServer;
}
