DO $$ BEGIN
 CREATE TYPE "public"."copy_status" AS ENUM('available', 'on_loan', 'lost', 'repair');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."loan_status" AS ENUM('open', 'overdue', 'returned');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "copies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"book_id" uuid NOT NULL REFERENCES "books"("id") ON DELETE cascade,
	"barcode" varchar(40) NOT NULL,
	"status" "copy_status" DEFAULT 'available' NOT NULL,
	"location" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "copies_tenant_barcode_uidx" ON "copies" ("tenant_id", "barcode");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "copies_book_status_idx" ON "copies" ("book_id", "status");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "loans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"copy_id" uuid NOT NULL REFERENCES "copies"("id"),
	"book_id" uuid NOT NULL REFERENCES "books"("id"),
	"client_id" uuid NOT NULL REFERENCES "clients"("id"),
	"borrowed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"returned_at" timestamp with time zone,
	"renewed_count" integer DEFAULT 0 NOT NULL,
	"status" "loan_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "loans_tenant_status_idx" ON "loans" ("tenant_id", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "loans_client_idx" ON "loans" ("client_id");
