ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "message_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "image_data" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "client_message_id" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "verification_code" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "verification_code_expires_at" timestamp;--> statement-breakpoint
CREATE INDEX "idx_messages_client_message_id" ON "messages" USING btree ("client_message_id");