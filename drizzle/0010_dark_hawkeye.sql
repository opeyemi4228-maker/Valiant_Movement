CREATE TYPE "public"."membership_category" AS ENUM('student', 'regular', 'professional', 'diaspora', 'honorary', 'institutional');--> statement-breakpoint
CREATE TYPE "public"."structure_level" AS ENUM('ward', 'lga', 'state', 'national');--> statement-breakpoint
CREATE TYPE "public"."structure_payment_kind" AS ENUM('dues_share', 'withdrawal', 'adjustment');--> statement-breakpoint
CREATE TABLE "structure_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"level" "structure_level" NOT NULL,
	"state_id" uuid,
	"lga_id" uuid,
	"ward" text,
	"name" text NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"reserved_ref" text,
	"reserved_accounts" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "structure_accounts_key_unique" UNIQUE("key"),
	CONSTRAINT "structure_accounts_reserved_ref_unique" UNIQUE("reserved_ref")
);
--> statement-breakpoint
CREATE TABLE "structure_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" "structure_payment_kind" NOT NULL,
	"status" "payment_status" DEFAULT 'completed' NOT NULL,
	"amount" integer NOT NULL,
	"source_user_id" uuid,
	"reference" text NOT NULL,
	"destination_bank_code" text,
	"destination_account_number" text,
	"destination_account_name" text,
	"authorized_by" text,
	"description" text,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "structure_payments_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
ALTER TABLE "identities" ADD COLUMN "membership_category" "membership_category" DEFAULT 'regular' NOT NULL;--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "reserved_ref" text;--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "reserved_accounts" jsonb;--> statement-breakpoint
ALTER TABLE "structure_accounts" ADD CONSTRAINT "structure_accounts_state_id_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structure_accounts" ADD CONSTRAINT "structure_accounts_lga_id_lgas_id_fk" FOREIGN KEY ("lga_id") REFERENCES "public"."lgas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structure_payments" ADD CONSTRAINT "structure_payments_account_id_structure_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."structure_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structure_payments" ADD CONSTRAINT "structure_payments_source_user_id_users_id_fk" FOREIGN KEY ("source_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "structure_accounts_geo_idx" ON "structure_accounts" USING btree ("level","state_id","lga_id");--> statement-breakpoint
CREATE INDEX "structure_payments_account_idx" ON "structure_payments" USING btree ("account_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "structure_payments_source_idx" ON "structure_payments" USING btree ("source_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_reserved_ref_unique" UNIQUE("reserved_ref");