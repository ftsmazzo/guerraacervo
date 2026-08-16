ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "referral_code" varchar(16);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenants_referral_code_uidx" ON "tenants" ("referral_code");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wish_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"isbn" varchar(32),
	"title" varchar(300) NOT NULL,
	"author" varchar(200),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."referral_status" AS ENUM('signed_up', 'paid', 'rewarded', 'invalid');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referrer_tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"referred_tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"code_used" varchar(16) NOT NULL,
	"status" "referral_status" DEFAULT 'signed_up' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "referrals_referred_uidx" ON "referrals" ("referred_tenant_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "referral_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"referral_id" uuid NOT NULL REFERENCES "referrals"("id") ON DELETE cascade,
	"credit_months" integer DEFAULT 0 NOT NULL,
	"credit_brl" numeric(12, 2) DEFAULT '0' NOT NULL,
	"applied_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
