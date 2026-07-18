CREATE TYPE "public"."report_status" AS ENUM('open', 'reviewing', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TABLE "member_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"reported_id" uuid NOT NULL,
	"category" text NOT NULL,
	"details" text,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_reports_no_self" CHECK (reporter_id <> reported_id)
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "cover_url" text;--> statement-breakpoint
ALTER TABLE "member_reports" ADD CONSTRAINT "member_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_reports" ADD CONSTRAINT "member_reports_reported_id_users_id_fk" FOREIGN KEY ("reported_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_reports_status_idx" ON "member_reports" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "member_reports_reported_idx" ON "member_reports" USING btree ("reported_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "member_reports_open_pair_idx" ON "member_reports" USING btree ("reporter_id","reported_id") WHERE status = 'open';