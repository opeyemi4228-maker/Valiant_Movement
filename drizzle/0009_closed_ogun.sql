ALTER TABLE "posts" ADD COLUMN "pinned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "flagged_at" timestamp with time zone;