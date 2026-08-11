ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "whatsapp" varchar(30);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "whatsapp_verified_at" timestamp with time zone;
