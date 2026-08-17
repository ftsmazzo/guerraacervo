DO $$ BEGIN
 CREATE TYPE "public"."reading_status" AS ENUM('quero_ler', 'lendo', 'lido', 'abandonado');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "reading_status" "reading_status" DEFAULT 'quero_ler' NOT NULL;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "current_page" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "finished_at" timestamp with time zone;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reading_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"daily_pages" integer DEFAULT 20 NOT NULL,
	"remind_at" varchar(5) DEFAULT '21:00' NOT NULL,
	"timezone" varchar(64) DEFAULT 'America/Sao_Paulo' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_reminded_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reading_plans_tenant_uidx" ON "reading_plans" ("tenant_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reading_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"book_id" uuid REFERENCES "books"("id") ON DELETE set null,
	"pages_read" integer DEFAULT 0 NOT NULL,
	"read_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reading_logs_tenant_book_day_uidx" ON "reading_logs" ("tenant_id", "book_id", "read_on");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reading_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"book_id" uuid REFERENCES "books"("id") ON DELETE set null,
	"body" text NOT NULL,
	"display_name" varchar(160) NOT NULL,
	"title" varchar(300) NOT NULL,
	"author" varchar(200),
	"cover_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reading_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL REFERENCES "reading_posts"("id") ON DELETE cascade,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"body" text NOT NULL,
	"display_name" varchar(160) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
