import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, jsonb, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Users table - integrates with Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  username: varchar("username").unique(), // Custom username for the app
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// AI Personas/Characters table
export const aiPersonas = pgTable("ai_personas", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  personality: text("personality").notNull(), // Short description
  systemPrompt: text("system_prompt").notNull(), // Full prompt for AI
  backstory: text("backstory"), // Character background
  greeting: text("greeting"), // Initial greeting message
  responseDelay: integer("response_delay").default(0).notNull(), // Delay in ms before responding
  lastMomentAt: timestamp("last_moment_at"), // Track last time AI posted a moment (for rate limiting)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Conversations table (supports both 1-on-1 and group chats)
export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title"), // For group chats
  isGroup: boolean("is_group").default(false).notNull(),
  lastMessageAt: timestamp("last_message_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Conversation participants (many-to-many: conversations <-> ai_personas)
export const conversationParticipants = pgTable(
  "conversation_participants",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    conversationId: varchar("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    personaId: varchar("persona_id").notNull().references(() => aiPersonas.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("unique_conversation_persona").on(table.conversationId, table.personaId),
    index("idx_conversation_participants_conversation_id").on(table.conversationId),
    index("idx_conversation_participants_persona_id").on(table.personaId),
  ],
);

// Messages table
export const messages = pgTable(
  "messages",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    conversationId: varchar("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    senderId: varchar("sender_id"), // null for user messages, personaId for AI messages
    senderType: text("sender_type").notNull(), // 'user' or 'ai'
    content: text("content").notNull(),
    isRead: boolean("is_read").default(false).notNull(),
    status: text("status").default("sent").notNull(), // 'sending', 'sent', 'failed'
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_messages_conversation_id").on(table.conversationId),
    index("idx_messages_created_at").on(table.createdAt),
  ],
);

// Memories table (AI remembers important user information)
export const memories = pgTable(
  "memories",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    personaId: varchar("persona_id").notNull().references(() => aiPersonas.id, { onDelete: "cascade" }),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(), // e.g., "favorite_color", "birthday"
    value: text("value").notNull(), // e.g., "blue", "1990-05-15"
    context: text("context"), // Additional context about where this was learned
    importance: integer("importance").default(5).notNull(), // 1-10 scale
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_memories_persona_id").on(table.personaId),
    index("idx_memories_user_id").on(table.userId),
  ],
);

// Moments table (similar to WeChat Moments/Instagram Posts)
export const moments = pgTable(
  "moments",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    authorId: varchar("author_id").notNull(), // userId or personaId
    authorType: text("author_type").notNull(), // 'user' or 'ai'
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), // Owner of the moment (for filtering)
    content: text("content").notNull(),
    images: text("images").array(), // Array of image URLs
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_moments_user_id").on(table.userId),
    index("idx_moments_created_at").on(table.createdAt),
  ],
);

// Moment likes table
export const momentLikes = pgTable(
  "moment_likes",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    momentId: varchar("moment_id").notNull().references(() => moments.id, { onDelete: "cascade" }),
    likerId: varchar("liker_id").notNull(), // userId or personaId
    likerType: text("liker_type").notNull(), // 'user' or 'ai'
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("unique_moment_liker").on(table.momentId, table.likerId),
    index("idx_moment_likes_moment_id").on(table.momentId),
  ],
);

// Moment comments table (supports nested replies)
export const momentComments = pgTable(
  "moment_comments",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    momentId: varchar("moment_id").notNull().references(() => moments.id, { onDelete: "cascade" }),
    authorId: varchar("author_id").notNull(), // userId or personaId
    authorType: text("author_type").notNull(), // 'user' or 'ai'
    content: text("content").notNull(),
    parentCommentId: varchar("parent_comment_id"), // For nested replies
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_moment_comments_moment_id").on(table.momentId),
    index("idx_moment_comments_parent_comment_id").on(table.parentCommentId),
    index("idx_moment_comments_created_at").on(table.createdAt),
  ],
);

// AI Settings table (per-user AI configuration)
export const aiSettings = pgTable(
  "ai_settings",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
    provider: text("provider").default("google").notNull(), // 'google', 'openai'
    model: text("model").default("gemini-2.5-pro").notNull(), // Model name
    customApiKey: text("custom_api_key"), // Optional custom API key for RAG embeddings
    ragEnabled: boolean("rag_enabled").default(false).notNull(), // Enable RAG features
    searchEnabled: boolean("search_enabled").default(true).notNull(), // Enable web search
    language: text("language").default("zh").notNull(), // UI language: 'zh' or 'en'
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_ai_settings_user_id").on(table.userId),
  ],
);

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Upsert schema for Replit Auth
export const upsertUserSchema = createInsertSchema(users).omit({
  createdAt: true,
  updatedAt: true,
  username: true,
}).required({ id: true });

// Update user profile schema (for username and avatar changes)
export const updateUserProfileSchema = z.object({
  username: z.string().min(1, "昵称不能为空").max(50, "昵称最多50个字符").optional(),
  profileImageUrl: z.string().min(1, "头像URL不能为空").optional(), // Allow relative URLs like /uploads/...
});

export const insertAiPersonaSchema = createInsertSchema(aiPersonas).omit({
  id: true,
  createdAt: true,
});

export const updateAiPersonaSchema = createInsertSchema(aiPersonas).omit({
  id: true,
  userId: true,
  createdAt: true,
}).partial();

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
  lastMessageAt: true,
});

export const insertConversationParticipantSchema = createInsertSchema(conversationParticipants).omit({
  id: true,
  addedAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export const insertMemorySchema = createInsertSchema(memories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMomentSchema = createInsertSchema(moments).omit({
  id: true,
  createdAt: true,
});

export const insertMomentLikeSchema = createInsertSchema(momentLikes).omit({
  id: true,
  createdAt: true,
});

export const insertMomentCommentSchema = createInsertSchema(momentComments).omit({
  id: true,
  createdAt: true,
});

export const insertAiSettingsSchema = createInsertSchema(aiSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateAiSettingsSchema = createInsertSchema(aiSettings).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
}).partial();

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpsertUser = z.infer<typeof upsertUserSchema>;
export type UpdateUserProfile = z.infer<typeof updateUserProfileSchema>;

export type AiPersona = typeof aiPersonas.$inferSelect;
export type InsertAiPersona = z.infer<typeof insertAiPersonaSchema>;

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;

export type ConversationParticipant = typeof conversationParticipants.$inferSelect;
export type InsertConversationParticipant = z.infer<typeof insertConversationParticipantSchema>;

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export type Memory = typeof memories.$inferSelect;
export type InsertMemory = z.infer<typeof insertMemorySchema>;

export type Moment = typeof moments.$inferSelect;
export type InsertMoment = z.infer<typeof insertMomentSchema>;

export type MomentLike = typeof momentLikes.$inferSelect;
export type InsertMomentLike = z.infer<typeof insertMomentLikeSchema>;

export type MomentComment = typeof momentComments.$inferSelect;
export type InsertMomentComment = z.infer<typeof insertMomentCommentSchema>;

export type AiSettings = typeof aiSettings.$inferSelect;
export type InsertAiSettings = z.infer<typeof insertAiSettingsSchema>;
export type UpdateAiSettings = z.infer<typeof updateAiSettingsSchema>;
