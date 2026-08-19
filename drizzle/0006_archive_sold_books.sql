ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "books_tenant_archived_idx" ON "books" ("tenant_id", "archived_at");
