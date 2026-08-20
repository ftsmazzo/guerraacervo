ALTER TABLE "loans" ADD COLUMN IF NOT EXISTS "checkout_photo_url" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN IF NOT EXISTS "return_photo_url" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN IF NOT EXISTS "checkout_condition" jsonb;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN IF NOT EXISTS "return_condition" jsonb;
