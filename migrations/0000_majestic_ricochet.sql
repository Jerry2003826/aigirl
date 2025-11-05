CREATE TABLE "ai_personas" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"avatar_url" text,
	"personality" text NOT NULL,
	"system_prompt" text NOT NULL,
	"backstory" text,
	"greeting" text,
	"response_delay" integer DEFAULT 0 NOT NULL,
	"last_moment_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_reply_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar NOT NULL,
	"user_message_id" varchar NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ai_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"provider" text DEFAULT 'google' NOT NULL,
	"model" text DEFAULT 'gemini-2.5-pro' NOT NULL,
	"custom_api_key" text,
	"rag_enabled" boolean DEFAULT false NOT NULL,
	"search_enabled" boolean DEFAULT true NOT NULL,
	"language" text DEFAULT 'zh' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "conversation_participants" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar NOT NULL,
	"persona_id" varchar NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"title" text,
	"is_group" boolean DEFAULT false NOT NULL,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"last_read_at" timestamp,
	"last_message_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memories" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"persona_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"conversation_id" varchar,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"context" text,
	"importance" integer DEFAULT 5 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar NOT NULL,
	"sender_id" varchar,
	"sender_type" text NOT NULL,
	"content" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moment_comments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"moment_id" varchar NOT NULL,
	"author_id" varchar NOT NULL,
	"author_type" text NOT NULL,
	"content" text NOT NULL,
	"parent_comment_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moment_likes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"moment_id" varchar NOT NULL,
	"liker_id" varchar NOT NULL,
	"liker_type" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" varchar NOT NULL,
	"author_type" text NOT NULL,
	"user_id" varchar NOT NULL,
	"content" text NOT NULL,
	"images" text[],
	"unread_comments_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"username" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "ai_personas" ADD CONSTRAINT "ai_personas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_reply_jobs" ADD CONSTRAINT "ai_reply_jobs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_reply_jobs" ADD CONSTRAINT "ai_reply_jobs_user_message_id_messages_id_fk" FOREIGN KEY ("user_message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_persona_id_ai_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."ai_personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_persona_id_ai_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."ai_personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moment_comments" ADD CONSTRAINT "moment_comments_moment_id_moments_id_fk" FOREIGN KEY ("moment_id") REFERENCES "public"."moments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moment_likes" ADD CONSTRAINT "moment_likes_moment_id_moments_id_fk" FOREIGN KEY ("moment_id") REFERENCES "public"."moments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moments" ADD CONSTRAINT "moments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ai_reply_jobs_status" ON "ai_reply_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_ai_reply_jobs_conversation_id" ON "ai_reply_jobs" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_ai_reply_jobs_created_at" ON "ai_reply_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_ai_settings_user_id" ON "ai_settings" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_conversation_persona" ON "conversation_participants" USING btree ("conversation_id","persona_id");--> statement-breakpoint
CREATE INDEX "idx_conversation_participants_conversation_id" ON "conversation_participants" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_conversation_participants_persona_id" ON "conversation_participants" USING btree ("persona_id");--> statement-breakpoint
CREATE INDEX "idx_memories_persona_id" ON "memories" USING btree ("persona_id");--> statement-breakpoint
CREATE INDEX "idx_memories_user_id" ON "memories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_memories_conversation_id" ON "memories" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_messages_conversation_id" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_messages_created_at" ON "messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_moment_comments_moment_id" ON "moment_comments" USING btree ("moment_id");--> statement-breakpoint
CREATE INDEX "idx_moment_comments_parent_comment_id" ON "moment_comments" USING btree ("parent_comment_id");--> statement-breakpoint
CREATE INDEX "idx_moment_comments_created_at" ON "moment_comments" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_moment_liker" ON "moment_likes" USING btree ("moment_id","liker_id");--> statement-breakpoint
CREATE INDEX "idx_moment_likes_moment_id" ON "moment_likes" USING btree ("moment_id");--> statement-breakpoint
CREATE INDEX "idx_moments_user_id" ON "moments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_moments_created_at" ON "moments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");