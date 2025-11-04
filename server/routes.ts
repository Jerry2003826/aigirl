import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { generateAIResponse, generateAIResponseStream, selectRespondingPersona, extractAndStoreMemories } from "./aiService";
import { setupWebSocket, broadcastNewMessage } from "./websocket";
import { 
  insertAiPersonaSchema, 
  updateAiPersonaSchema,
  insertConversationSchema, 
  insertMessageSchema,
  insertConversationParticipantSchema 
} from "@shared/schema";

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
      res.json(conversations);
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

  app.post('/api/messages', isAuthenticated, async (req: any, res) => {
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
  app.post('/api/ai/select-persona', isAuthenticated, async (req: any, res) => {
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
  app.post('/api/ai/generate', isAuthenticated, async (req: any, res) => {
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

  app.post('/api/ai/generate-stream', isAuthenticated, async (req: any, res) => {
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

  const httpServer = createServer(app);
  
  // Setup WebSocket server for real-time messaging
  setupWebSocket(httpServer);
  
  return httpServer;
}
