CREATE TYPE "public"."whatsapp_connection_status" AS ENUM('disconnected', 'qr', 'open');--> statement-breakpoint
CREATE TYPE "public"."client_onboarding_status" AS ENUM('pending', 'in_progress', 'done', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."interest_tag_source" AS ENUM('declared', 'purchase', 'engagement');--> statement-breakpoint
CREATE TABLE "whatsapp_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"instance_name" varchar(80) NOT NULL,
	"status" "whatsapp_connection_status" DEFAULT 'disconnected' NOT NULL,
	"phone" varchar(30),
	"last_qr" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"opt_in_notices" boolean DEFAULT false NOT NULL,
	"budget_min" integer,
	"budget_max" integer,
	"onboarding_status" "client_onboarding_status" DEFAULT 'pending' NOT NULL,
	"onboarding_step" varchar(40),
	"raw_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_interest_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"tag" varchar(80) NOT NULL,
	"source" "interest_tag_source" DEFAULT 'declared' NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_interest_tags" ADD CONSTRAINT "client_interest_tags_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_interest_tags" ADD CONSTRAINT "client_interest_tags_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_connections_tenant_uidx" ON "whatsapp_connections" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_connections_instance_uidx" ON "whatsapp_connections" USING btree ("instance_name");--> statement-breakpoint
CREATE UNIQUE INDEX "client_profiles_client_uidx" ON "client_profiles" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_interest_tags_uidx" ON "client_interest_tags" USING btree ("client_id","tag","source");
