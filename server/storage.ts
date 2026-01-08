import { 
  type User, type InsertUser, type UpsertUser, type UpdateUserProfile,
  type AiPersona, type InsertAiPersona,
  type Conversation, type InsertConversation,
  type ConversationParticipant, type InsertConversationParticipant,
  type Message, type InsertMessage,
  type Memory, type InsertMemory,
  type Moment, type InsertMoment,
  type MomentLike, type InsertMomentLike,
  type MomentComment, type InsertMomentComment,
  type AiSettings, type InsertAiSettings, type UpdateAiSettings,
  type AiReplyJob, type InsertAiReplyJob,
  users,
  aiPersonas,
  conversations,
  conversationParticipants,
  messages,
  memories,
  moments,
  momentLikes,
  momentComments,
  aiSettings,
  aiReplyJobs
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db, pool } from "./db";
import { INSTANCE_ID } from "./instance";
import { eq, and, or, desc, asc, count, inArray, sql } from "drizzle-orm";

// Storage interface with all CRUD methods needed for the AI chat app
export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserProfile(userId: string, profile: UpdateUserProfile): Promise<User | undefined>;
  createUnverifiedUser(email: string, passwordHash: string, verificationCode: string, expiresAt: Date): Promise<User>;
  verifyUser(email: string): Promise<User | undefined>;
  updatePasswordResetCode(email: string, code: string, expiresAt: Date): Promise<User | undefined>;
  updateUserPassword(email: string, passwordHash: string): Promise<User | undefined>;
  
  // AI Persona operations
  getPersona(id: string): Promise<AiPersona | undefined>;
  getPersonasByUser(userId: string): Promise<AiPersona[]>;
  createPersona(persona: InsertAiPersona): Promise<AiPersona>;
  updatePersona(id: string, persona: Partial<InsertAiPersona>): Promise<AiPersona | undefined>;
  deletePersona(id: string): Promise<boolean>;
  
  // Conversation operations
  getConversation(id: string): Promise<Conversation | undefined>;
  getConversationsByUser(userId: string): Promise<Conversation[]>;
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  updateConversation(id: string, data: Partial<Pick<Conversation, 'avatarUrl' | 'title'>>): Promise<Conversation | undefined>;
  updateConversationLastMessage(id: string): Promise<void>;
  deleteConversation(id: string): Promise<boolean>;
  
  // Conversation participant operations
  addParticipant(participant: InsertConversationParticipant): Promise<ConversationParticipant>;
  getConversationParticipants(conversationId: string): Promise<ConversationParticipant[]>;
  removeParticipant(conversationId: string, personaId: string): Promise<boolean>;
  
  // Message operations
  getMessage(id: string): Promise<Message | undefined>;
  getMessagesByConversation(conversationId: string, limit?: number, offset?: number): Promise<(Message & { personaName?: string; personaAvatar?: string | null })[]>;
  getConversationStats(conversationId: string): Promise<{ lastMessage: Message | null; unreadCount: number }>;
  countUserMessages(conversationId: string): Promise<number>; // Count total user messages in conversation
  createMessage(message: InsertMessage): Promise<Message>;
  updateMessageStatus(id: string, status: string): Promise<void>;
  markMessageAsRead(id: string): Promise<void>;
  markConversationMessagesAsRead(conversationId: string): Promise<void>;
  
  // Memory operations
  getMemory(id: string): Promise<Memory | undefined>;
  getMemoriesByPersona(personaId: string, userId: string): Promise<Memory[]>;
  createMemory(memory: InsertMemory): Promise<Memory>;
  updateMemory(id: string, memory: Partial<InsertMemory>): Promise<Memory | undefined>;
  deleteMemory(id: string): Promise<boolean>;
  
  // Moment operations
  getMoment(id: string): Promise<Moment | undefined>;
  getMomentsByUser(userId: string, limit?: number, offset?: number): Promise<Moment[]>;
  createMoment(moment: InsertMoment): Promise<Moment>;
  deleteMoment(id: string): Promise<boolean>;
  
  // Moment like operations
  toggleMomentLike(momentId: string, likerId: string, likerType: 'user' | 'ai'): Promise<boolean>; // Returns true if liked, false if unliked
  getMomentLikes(momentId: string): Promise<MomentLike[]>;
  
  // Moment comment operations
  createMomentComment(comment: InsertMomentComment): Promise<MomentComment>;
  getMomentComments(momentId: string): Promise<MomentComment[]>;
  getMomentCommentById(id: string): Promise<MomentComment | undefined>;
  deleteMomentComment(id: string): Promise<boolean>;
  markMomentCommentsAsRead(momentId: string): Promise<void>; // Mark all comments on a moment as read
  
  // AI Settings operations
  getAiSettings(userId: string): Promise<AiSettings | undefined>;
  createAiSettings(settings: InsertAiSettings): Promise<AiSettings>;
  updateAiSettings(userId: string, settings: UpdateAiSettings): Promise<AiSettings | undefined>;
  
  // AI Reply Job operations (background queue)
  createAiReplyJob(job: InsertAiReplyJob): Promise<AiReplyJob>;
  getNextPendingJob(): Promise<AiReplyJob | undefined>;
  updateJobStatus(id: string, status: string, error?: string): Promise<void>;
  incrementJobAttempts(id: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private aiPersonas: Map<string, AiPersona>;
  private conversations: Map<string, Conversation>;
  private conversationParticipants: Map<string, ConversationParticipant>;
  private messages: Map<string, Message>;
  private memories: Map<string, Memory>;
  private aiReplyJobs: Map<string, AiReplyJob>;

  constructor() {
    this.users = new Map();
    this.aiPersonas = new Map();
    this.conversations = new Map();
    this.conversationParticipants = new Map();
    this.messages = new Map();
    this.memories = new Map();
    this.aiReplyJobs = new Map();
  }

  // User operations
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === email,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const now = new Date();
    const user: User = { 
      id,
      username: insertUser.username ?? null,
      email: insertUser.email ?? null,
      firstName: insertUser.firstName ?? null,
      lastName: insertUser.lastName ?? null,
      profileImageUrl: insertUser.profileImageUrl ?? null,
      createdAt: now,
      updatedAt: null,
    };
    this.users.set(id, user);
    return user;
  }

  async upsertUser(upsertData: UpsertUser): Promise<User> {
    const existingUser = this.users.get(upsertData.id);
    const now = new Date();
    
    if (existingUser) {
      // Update existing user
      const updated: User = {
        ...existingUser,
        email: upsertData.email ?? existingUser.email,
        firstName: upsertData.firstName ?? existingUser.firstName,
        lastName: upsertData.lastName ?? existingUser.lastName,
        profileImageUrl: upsertData.profileImageUrl ?? existingUser.profileImageUrl,
        updatedAt: now,
      };
      this.users.set(upsertData.id, updated);
      return updated;
    } else {
      // Create new user
      const newUser: User = {
        id: upsertData.id,
        username: null,
        email: upsertData.email ?? null,
        firstName: upsertData.firstName ?? null,
        lastName: upsertData.lastName ?? null,
        profileImageUrl: upsertData.profileImageUrl ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.users.set(upsertData.id, newUser);
      return newUser;
    }
  }

  async updateUserProfile(userId: string, profile: UpdateUserProfile): Promise<User | undefined> {
    const existingUser = this.users.get(userId);
    if (!existingUser) {
      return undefined;
    }
    
    const updated: User = {
      ...existingUser,
      username: profile.username ?? existingUser.username,
      profileImageUrl: profile.profileImageUrl ?? existingUser.profileImageUrl,
      updatedAt: new Date(),
    };
    
    this.users.set(userId, updated);
    return updated;
  }

  // AI Persona operations
  async getPersona(id: string): Promise<AiPersona | undefined> {
    return this.aiPersonas.get(id);
  }

  async getPersonasByUser(userId: string): Promise<AiPersona[]> {
    return Array.from(this.aiPersonas.values()).filter(
      (persona) => persona.userId === userId,
    );
  }

  async createPersona(insertPersona: InsertAiPersona): Promise<AiPersona> {
    const id = randomUUID();
    const persona: AiPersona = {
      id,
      userId: insertPersona.userId,
      name: insertPersona.name,
      avatarUrl: insertPersona.avatarUrl ?? null,
      personality: insertPersona.personality,
      systemPrompt: insertPersona.systemPrompt,
      backstory: insertPersona.backstory ?? null,
      greeting: insertPersona.greeting ?? null,
      model: insertPersona.model || "gemini-2.5-pro",
      responseDelay: insertPersona.responseDelay || 0,
      lastMomentAt: null,
      createdAt: new Date(),
    };
    this.aiPersonas.set(id, persona);
    return persona;
  }

  async updatePersona(id: string, updates: Partial<InsertAiPersona>): Promise<AiPersona | undefined> {
    const persona = this.aiPersonas.get(id);
    if (!persona) return undefined;
    
    // Explicitly exclude protected fields (userId, createdAt)
    const { userId, ...safeUpdates } = updates as any;
    const updated = { ...persona, ...safeUpdates };
    this.aiPersonas.set(id, updated);
    return updated;
  }

  async deletePersona(id: string): Promise<boolean> {
    return this.aiPersonas.delete(id);
  }

  // Conversation operations
  async getConversation(id: string): Promise<Conversation | undefined> {
    return this.conversations.get(id);
  }

  async getConversationsByUser(userId: string): Promise<Conversation[]> {
    return Array.from(this.conversations.values())
      .filter((conv) => conv.userId === userId)
      .sort((a, b) => {
        const aTime = a.lastMessageAt || a.createdAt;
        const bTime = b.lastMessageAt || b.createdAt;
        return bTime.getTime() - aTime.getTime();
      });
  }

  async createConversation(insertConversation: InsertConversation): Promise<Conversation> {
    const id = randomUUID();
    const conversation: Conversation = {
      id,
      userId: insertConversation.userId,
      title: insertConversation.title ?? null,
      avatarUrl: insertConversation.avatarUrl ?? null,
      isGroup: insertConversation.isGroup ?? false,
      unreadCount: 0,
      lastReadAt: null,
      lastMessageAt: null,
      createdAt: new Date(),
    };
    this.conversations.set(id, conversation);
    return conversation;
  }

  async updateConversation(id: string, data: Partial<Pick<Conversation, 'avatarUrl' | 'title'>>): Promise<Conversation | undefined> {
    const conversation = this.conversations.get(id);
    if (!conversation) return undefined;
    
    const updated: Conversation = {
      ...conversation,
      ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }),
      ...(data.title !== undefined && { title: data.title }),
    };
    
    this.conversations.set(id, updated);
    return updated;
  }

  async updateConversationLastMessage(id: string): Promise<void> {
    const conversation = this.conversations.get(id);
    if (conversation) {
      conversation.lastMessageAt = new Date();
      this.conversations.set(id, conversation);
    }
  }

  async deleteConversation(id: string): Promise<boolean> {
    // Cascade delete participants (mimics DB CASCADE behavior)
    const participants = Array.from(this.conversationParticipants.values()).filter(
      (p) => p.conversationId === id,
    );
    for (const participant of participants) {
      this.conversationParticipants.delete(participant.id);
    }
    
    // Cascade delete messages (mimics DB CASCADE behavior)
    const messages = Array.from(this.messages.values()).filter(
      (m) => m.conversationId === id,
    );
    for (const message of messages) {
      this.messages.delete(message.id);
    }
    
    return this.conversations.delete(id);
  }

  // Conversation participant operations
  async addParticipant(insertParticipant: InsertConversationParticipant): Promise<ConversationParticipant> {
    const id = randomUUID();
    const participant: ConversationParticipant = {
      ...insertParticipant,
      id,
      addedAt: new Date(),
    };
    this.conversationParticipants.set(id, participant);
    return participant;
  }

  async getConversationParticipants(conversationId: string): Promise<ConversationParticipant[]> {
    return Array.from(this.conversationParticipants.values()).filter(
      (p) => p.conversationId === conversationId,
    );
  }

  async removeParticipant(conversationId: string, personaId: string): Promise<boolean> {
    const participant = Array.from(this.conversationParticipants.values()).find(
      (p) => p.conversationId === conversationId && p.personaId === personaId,
    );
    if (participant) {
      return this.conversationParticipants.delete(participant.id);
    }
    return false;
  }

  // Message operations
  async getMessage(id: string): Promise<Message | undefined> {
    return this.messages.get(id);
  }

  async getMessagesByConversation(
    conversationId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<Message[]> {
    return Array.from(this.messages.values())
      .filter((msg) => msg.conversationId === conversationId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(offset, offset + limit);
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = randomUUID();
    const message: Message = {
      id,
      conversationId: insertMessage.conversationId,
      senderId: insertMessage.senderId ?? null,
      senderType: insertMessage.senderType,
      content: insertMessage.content,
      isRead: insertMessage.isRead ?? false,
      status: insertMessage.status ?? "sent",
      createdAt: new Date(),
    };
    this.messages.set(id, message);
    
    // Auto-increment messageCount for all messages (matches PgStorage behavior)
    const conversation = this.conversations.get(insertMessage.conversationId);
    if (conversation) {
      conversation.messageCount = (conversation.messageCount || 0) + 1;
      
      // Auto-increment unreadCount for AI messages
      if (insertMessage.senderType === 'ai') {
        conversation.unreadCount = (conversation.unreadCount || 0) + 1;
      }
      
      this.conversations.set(insertMessage.conversationId, conversation);
    }
    
    return message;
  }

  async updateMessageStatus(id: string, status: string): Promise<void> {
    const message = this.messages.get(id);
    if (message) {
      message.status = status;
      this.messages.set(id, message);
    }
  }

  async markMessageAsRead(id: string): Promise<void> {
    const message = this.messages.get(id);
    if (message) {
      message.isRead = true;
      this.messages.set(id, message);
    }
  }

  async markConversationMessagesAsRead(conversationId: string): Promise<void> {
    // Mark all unread messages as read
    Array.from(this.messages.values()).forEach((message) => {
      if (message.conversationId === conversationId && !message.isRead) {
        message.isRead = true;
        this.messages.set(message.id, message);
      }
    });
    
    // Clear unread count and update last read time (matches PgStorage behavior)
    const conversation = this.conversations.get(conversationId);
    if (conversation) {
      conversation.unreadCount = 0;
      conversation.lastReadAt = new Date();
      this.conversations.set(conversationId, conversation);
    }
  }

  async getConversationStats(conversationId: string): Promise<{ lastMessage: Message | null; unreadCount: number }> {
    const conversationMessages = Array.from(this.messages.values())
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    const lastMessage = conversationMessages[0] || null;
    const unreadCount = conversationMessages.filter(m => m.senderType === 'ai' && !m.isRead).length;
    
    return { lastMessage, unreadCount };
  }

  // Memory operations
  async getMemory(id: string): Promise<Memory | undefined> {
    return this.memories.get(id);
  }

  async getMemoriesByPersona(personaId: string, userId: string): Promise<Memory[]> {
    return Array.from(this.memories.values())
      .filter((mem) => mem.personaId === personaId && mem.userId === userId)
      .sort((a, b) => b.importance - a.importance);
  }

  async createMemory(insertMemory: InsertMemory): Promise<Memory> {
    const id = randomUUID();
    const now = new Date();
    const memory: Memory = {
      id,
      personaId: insertMemory.personaId,
      userId: insertMemory.userId,
      key: insertMemory.key,
      value: insertMemory.value,
      context: insertMemory.context ?? null,
      importance: insertMemory.importance ?? 5,
      createdAt: now,
      updatedAt: now,
    };
    this.memories.set(id, memory);
    return memory;
  }

  async updateMemory(id: string, updates: Partial<InsertMemory>): Promise<Memory | undefined> {
    const memory = this.memories.get(id);
    if (!memory) return undefined;
    
    const updated = { 
      ...memory, 
      ...updates,
      updatedAt: new Date(),
    };
    this.memories.set(id, updated);
    return updated;
  }

  async deleteMemory(id: string): Promise<boolean> {
    return this.memories.delete(id);
  }
  
  // AI Reply Job operations (background queue)
  async createAiReplyJob(job: InsertAiReplyJob): Promise<AiReplyJob> {
    const id = randomUUID();
    const aiReplyJob: AiReplyJob = {
      id,
      conversationId: job.conversationId,
      userMessageId: job.userMessageId,
      status: job.status ?? 'pending',
      attempts: job.attempts ?? 0,
      error: job.error ?? null,
      createdAt: new Date(),
      processedAt: null,
    };
    this.aiReplyJobs.set(id, aiReplyJob);
    return aiReplyJob;
  }
  
  async getNextPendingJob(): Promise<AiReplyJob | undefined> {
    return Array.from(this.aiReplyJobs.values())
      .filter((job) => job.status === 'pending')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
  }
  
  async updateJobStatus(id: string, status: string, error?: string): Promise<void> {
    const job = this.aiReplyJobs.get(id);
    if (job) {
      job.status = status;
      job.error = error || null;
      job.processedAt = status !== 'pending' ? new Date() : null;
      this.aiReplyJobs.set(id, job);
    }
  }
  
  async incrementJobAttempts(id: string): Promise<void> {
    const job = this.aiReplyJobs.get(id);
    if (job) {
      job.attempts += 1;
      this.aiReplyJobs.set(id, job);
    }
  }
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async upsertUser(upsertData: UpsertUser): Promise<User> {
    // Handle both id and email conflicts
    // First try to find existing user by id or email
    const existing = await db
      .select()
      .from(users)
      .where(
        or(
          eq(users.id, upsertData.id),
          eq(users.email, upsertData.email || '')
        )
      )
      .limit(1);
    
    if (existing.length > 0) {
      // Update existing user
      const result = await db
        .update(users)
        .set({
          id: upsertData.id, // Update id in case email matched but id different
          email: upsertData.email,
          firstName: upsertData.firstName,
          lastName: upsertData.lastName,
          profileImageUrl: upsertData.profileImageUrl,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing[0].id))
        .returning();
      return result[0];
    } else {
      // Insert new user
      const result = await db
        .insert(users)
        .values(upsertData)
        .returning();
      return result[0];
    }
  }

  async updateUserProfile(userId: string, profile: UpdateUserProfile): Promise<User | undefined> {
    const result = await db
      .update(users)
      .set({
        ...profile,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return result[0];
  }

  async createUnverifiedUser(email: string, passwordHash: string, verificationCode: string, expiresAt: Date): Promise<User> {
    // First check if user already exists
    const existing = await this.getUserByEmail(email);
    if (existing) {
      // Update existing unverified user with new verification code
      const result = await db
        .update(users)
        .set({
          passwordHash,
          verificationCode,
          verificationCodeExpiresAt: expiresAt,
          emailVerified: false,
          updatedAt: new Date(),
        })
        .where(eq(users.email, email))
        .returning();
      return result[0];
    } else {
      // Create new unverified user
      const result = await db
        .insert(users)
        .values({
          email,
          passwordHash,
          verificationCode,
          verificationCodeExpiresAt: expiresAt,
          emailVerified: false,
        })
        .returning();
      return result[0];
    }
  }

  async verifyUser(email: string): Promise<User | undefined> {
    const result = await db
      .update(users)
      .set({
        emailVerified: true,
        verificationCode: null,
        verificationCodeExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.email, email))
      .returning();
    return result[0];
  }

  async updatePasswordResetCode(email: string, code: string, expiresAt: Date): Promise<User | undefined> {
    const result = await db
      .update(users)
      .set({
        verificationCode: code,
        verificationCodeExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(users.email, email))
      .returning();
    return result[0];
  }

  async updateUserPassword(email: string, passwordHash: string): Promise<User | undefined> {
    const result = await db
      .update(users)
      .set({
        passwordHash,
        verificationCode: null,
        verificationCodeExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.email, email))
      .returning();
    return result[0];
  }

  // AI Persona operations
  async getPersona(id: string): Promise<AiPersona | undefined> {
    const result = await db.select().from(aiPersonas).where(eq(aiPersonas.id, id)).limit(1);
    return result[0];
  }

  async getPersonasByUser(userId: string): Promise<AiPersona[]> {
    return await db.select().from(aiPersonas).where(eq(aiPersonas.userId, userId));
  }

  async createPersona(insertPersona: InsertAiPersona): Promise<AiPersona> {
    const result = await db.insert(aiPersonas).values(insertPersona).returning();
    return result[0];
  }

  async updatePersona(id: string, updates: Partial<InsertAiPersona>): Promise<AiPersona | undefined> {
    // Explicitly exclude protected fields (userId, createdAt)
    const { userId, ...safeUpdates } = updates as any;
    const result = await db
      .update(aiPersonas)
      .set(safeUpdates)
      .where(eq(aiPersonas.id, id))
      .returning();
    return result[0];
  }

  async deletePersona(id: string): Promise<boolean> {
    // First, find all conversations that include this persona
    const participants = await db
      .select({ conversationId: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.personaId, id));
    
    // Delete all related conversations (this will cascade delete participants and messages)
    const conversationIds = participants.map(p => p.conversationId);
    if (conversationIds.length > 0) {
      await db.delete(conversations).where(inArray(conversations.id, conversationIds));
    }
    
    // Now delete the persona
    const result = await db.delete(aiPersonas).where(eq(aiPersonas.id, id)).returning();
    return result.length > 0;
  }

  // Conversation operations
  async getConversation(id: string): Promise<Conversation | undefined> {
    const result = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    return result[0];
  }

  async getConversationsByUser(userId: string): Promise<Conversation[]> {
    return await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.lastMessageAt), desc(conversations.createdAt));
  }

  async createConversation(insertConversation: InsertConversation): Promise<Conversation> {
    const result = await db.insert(conversations).values(insertConversation).returning();
    return result[0];
  }

  async updateConversation(id: string, data: Partial<Pick<Conversation, 'avatarUrl' | 'title'>>): Promise<Conversation | undefined> {
    const result = await db
      .update(conversations)
      .set(data)
      .where(eq(conversations.id, id))
      .returning();
    return result[0];
  }

  async updateConversationLastMessage(id: string): Promise<void> {
    await db
      .update(conversations)
      .set({ lastMessageAt: new Date() })
      .where(eq(conversations.id, id));
  }

  async deleteConversation(id: string): Promise<boolean> {
    const result = await db.delete(conversations).where(eq(conversations.id, id)).returning();
    return result.length > 0;
  }

  // Conversation participant operations
  async addParticipant(insertParticipant: InsertConversationParticipant): Promise<ConversationParticipant> {
    const result = await db.insert(conversationParticipants).values(insertParticipant).returning();
    return result[0];
  }

  async getConversationParticipants(conversationId: string): Promise<ConversationParticipant[]> {
    return await db
      .select()
      .from(conversationParticipants)
      .where(eq(conversationParticipants.conversationId, conversationId));
  }

  async removeParticipant(conversationId: string, personaId: string): Promise<boolean> {
    const result = await db
      .delete(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.personaId, personaId)
        )
      )
      .returning();
    return result.length > 0;
  }

  // Message operations
  async getMessage(id: string): Promise<Message | undefined> {
    const result = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
    return result[0];
  }

  async getMessagesByConversation(
    conversationId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<(Message & { personaName?: string; personaAvatar?: string | null })[]> {
    const results = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        senderId: messages.senderId,
        senderType: messages.senderType,
        content: messages.content,
        imageData: messages.imageData,
        isRead: messages.isRead,
        status: messages.status,
        createdAt: messages.createdAt,
        personaName: aiPersonas.name,
        personaAvatar: aiPersonas.avatarUrl,
      })
      .from(messages)
      .leftJoin(aiPersonas, eq(messages.senderId, aiPersonas.id))
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(limit)
      .offset(offset);
    
    return results as (Message & { personaName?: string; personaAvatar?: string | null })[];
  }

  async countUserMessages(conversationId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          eq(messages.senderType, 'user')
        )
      );
    
    return result[0]?.count || 0;
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const result = await db.insert(messages).values(insertMessage).returning();
    
    // Auto-increment messageCount for all messages (triggers memory extraction every 10 messages)
    await db
      .update(conversations)
      .set({ messageCount: sql`${conversations.messageCount} + 1` })
      .where(eq(conversations.id, insertMessage.conversationId));
    
    // Auto-increment unreadCount for AI messages
    if (insertMessage.senderType === 'ai') {
      await db
        .update(conversations)
        .set({ unreadCount: sql`${conversations.unreadCount} + 1` })
        .where(eq(conversations.id, insertMessage.conversationId));
    }

    // Cross-instance realtime: publish a message-created event via Postgres NOTIFY.
    // Other server instances will LISTEN and broadcast to their connected WebSocket clients.
    // This fixes "DB already has messages but frontend doesn't update" in multi-instance deployments.
    try {
      const payload = JSON.stringify({
        instanceId: INSTANCE_ID,
        conversationId: insertMessage.conversationId,
        messageId: result[0]?.id,
      });
      // Don't block request/worker path on notify.
      void pool
        .query("select pg_notify($1, $2)", ["chat_message_created", payload])
        .catch((err) => console.error("[MessageBus] pg_notify failed:", err));
    } catch (err) {
      console.error("[MessageBus] Failed to build notify payload:", err);
    }

    return result[0];
  }

  async updateMessageStatus(id: string, status: string): Promise<void> {
    await db.update(messages).set({ status }).where(eq(messages.id, id));
  }

  async markMessageAsRead(id: string): Promise<void> {
    await db.update(messages).set({ isRead: true }).where(eq(messages.id, id));
  }

  async markConversationMessagesAsRead(conversationId: string): Promise<void> {
    // Mark all unread messages as read
    await db.update(messages).set({ isRead: true }).where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.isRead, false)
      )
    );
    
    // Clear unread count and update last read time
    await db
      .update(conversations)
      .set({ 
        unreadCount: 0,
        lastReadAt: new Date()
      })
      .where(eq(conversations.id, conversationId));
  }

  async getConversationStats(conversationId: string): Promise<{ lastMessage: Message | null; unreadCount: number }> {
    // Get last message with a single query
    const lastMessageResult = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(1);
    
    // Get cached unreadCount directly from conversations table (no COUNT query needed!)
    const conversationResult = await db
      .select({ unreadCount: conversations.unreadCount })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    
    return {
      lastMessage: lastMessageResult[0] || null,
      unreadCount: conversationResult[0]?.unreadCount || 0,
    };
  }

  // Memory operations
  async getMemory(id: string): Promise<Memory | undefined> {
    const result = await db.select().from(memories).where(eq(memories.id, id)).limit(1);
    return result[0];
  }

  async getMemoriesByPersona(personaId: string, userId: string): Promise<Memory[]> {
    return await db
      .select()
      .from(memories)
      .where(and(eq(memories.personaId, personaId), eq(memories.userId, userId)))
      .orderBy(desc(memories.importance));
  }

  async createMemory(insertMemory: InsertMemory): Promise<Memory> {
    const result = await db.insert(memories).values(insertMemory).returning();
    return result[0];
  }

  async updateMemory(id: string, updates: Partial<InsertMemory>): Promise<Memory | undefined> {
    const result = await db
      .update(memories)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(memories.id, id))
      .returning();
    return result[0];
  }

  async deleteMemory(id: string): Promise<boolean> {
    const result = await db.delete(memories).where(eq(memories.id, id)).returning();
    return result.length > 0;
  }

  // Moment operations
  async getMoment(id: string): Promise<Moment | undefined> {
    const result = await db.select().from(moments).where(eq(moments.id, id)).limit(1);
    return result[0];
  }

  async getAllMoments(limit: number = 50, offset: number = 0): Promise<Moment[]> {
    return await db
      .select()
      .from(moments)
      .orderBy(desc(moments.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async getMomentsByUser(userId: string, limit: number = 50, offset: number = 0): Promise<Moment[]> {
    return await db
      .select()
      .from(moments)
      .where(eq(moments.userId, userId))
      .orderBy(desc(moments.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async createMoment(insertMoment: InsertMoment): Promise<Moment> {
    const result = await db.insert(moments).values(insertMoment).returning();
    return result[0];
  }

  async deleteMoment(id: string): Promise<boolean> {
    const result = await db.delete(moments).where(eq(moments.id, id)).returning();
    return result.length > 0;
  }

  // Moment like operations
  async toggleMomentLike(momentId: string, likerId: string, likerType: 'user' | 'ai'): Promise<boolean> {
    // Check if already liked
    const existing = await db
      .select()
      .from(momentLikes)
      .where(and(eq(momentLikes.momentId, momentId), eq(momentLikes.likerId, likerId)))
      .limit(1);

    if (existing.length > 0) {
      // Unlike: delete the like
      await db
        .delete(momentLikes)
        .where(and(eq(momentLikes.momentId, momentId), eq(momentLikes.likerId, likerId)));
      return false; // Unliked
    } else {
      // Like: insert the like
      await db.insert(momentLikes).values({ momentId, likerId, likerType });
      return true; // Liked
    }
  }

  async getMomentLikes(momentId: string): Promise<MomentLike[]> {
    return await db
      .select()
      .from(momentLikes)
      .where(eq(momentLikes.momentId, momentId))
      .orderBy(asc(momentLikes.createdAt));
  }

  // Moment comment operations
  async createMomentComment(insertComment: InsertMomentComment): Promise<MomentComment> {
    const result = await db.insert(momentComments).values(insertComment).returning();
    const comment = result[0];
    
    // Increment unread comments count for the moment author (if commenter is not the author)
    const moment = await db
      .select()
      .from(moments)
      .where(eq(moments.id, insertComment.momentId))
      .limit(1);
    
    if (moment[0] && moment[0].authorId !== insertComment.authorId) {
      // Increment unread count only if the comment is from someone other than the moment author
      await db
        .update(moments)
        .set({ unreadCommentsCount: sql`${moments.unreadCommentsCount} + 1` })
        .where(eq(moments.id, insertComment.momentId));
    }
    
    return comment;
  }

  async getMomentComments(momentId: string): Promise<MomentComment[]> {
    return await db
      .select()
      .from(momentComments)
      .where(eq(momentComments.momentId, momentId))
      .orderBy(asc(momentComments.createdAt));
  }

  async getMomentCommentById(id: string): Promise<MomentComment | undefined> {
    const result = await db
      .select()
      .from(momentComments)
      .where(eq(momentComments.id, id))
      .limit(1);
    return result[0];
  }

  async deleteMomentComment(id: string): Promise<boolean> {
    const result = await db.delete(momentComments).where(eq(momentComments.id, id)).returning();
    return result.length > 0;
  }

  async markMomentCommentsAsRead(momentId: string): Promise<void> {
    // Reset unread comments count to 0
    await db
      .update(moments)
      .set({ unreadCommentsCount: 0 })
      .where(eq(moments.id, momentId));
  }

  // AI Settings operations
  async getAiSettings(userId: string): Promise<AiSettings | undefined> {
    const result = await db
      .select()
      .from(aiSettings)
      .where(eq(aiSettings.userId, userId))
      .limit(1);
    return result[0];
  }

  async createAiSettings(settings: InsertAiSettings): Promise<AiSettings> {
    const result = await db.insert(aiSettings).values(settings).returning();
    return result[0];
  }

  async updateAiSettings(userId: string, updates: UpdateAiSettings): Promise<AiSettings | undefined> {
    const result = await db
      .update(aiSettings)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(aiSettings.userId, userId))
      .returning();
    return result[0];
  }
  
  // AI Reply Job operations (background queue)
  async createAiReplyJob(job: InsertAiReplyJob): Promise<AiReplyJob> {
    const result = await db
      .insert(aiReplyJobs)
      .values(job)
      .returning();
    return result[0];
  }
  
  async getNextPendingJob(): Promise<AiReplyJob | undefined> {
    // Use FOR UPDATE SKIP LOCKED to prevent duplicate processing
    // Note: Raw SQL returns snake_case, so we manually map to camelCase
    const result = await db.execute(sql`
      SELECT * FROM ai_reply_jobs
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `);
    
    const row: any = result.rows[0];
    if (!row) return undefined;
    
    // Manually map snake_case to camelCase
    return {
      id: row.id,
      conversationId: row.conversation_id,
      userMessageId: row.user_message_id,
      status: row.status,
      attempts: row.attempts,
      error: row.error,
      createdAt: row.created_at,
      processedAt: row.processed_at,
    };
  }
  
  async updateJobStatus(id: string, status: string, error?: string): Promise<void> {
    await db
      .update(aiReplyJobs)
      .set({ 
        status, 
        error: error || null,
        processedAt: status !== 'pending' ? new Date() : null
      })
      .where(eq(aiReplyJobs.id, id));
  }
  
  async incrementJobAttempts(id: string): Promise<void> {
    await db
      .update(aiReplyJobs)
      .set({ attempts: sql`${aiReplyJobs.attempts} + 1` })
      .where(eq(aiReplyJobs.id, id));
  }
}

export const storage = new DatabaseStorage();
