CREATE TABLE "call_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"caller_id" uuid NOT NULL,
	"callee_id" uuid NOT NULL,
	"caller_name" text NOT NULL,
	"caller_color" text NOT NULL,
	"callee_name" text NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'ringing' NOT NULL,
	"offer" text,
	"answer" text,
	"ice_caller" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ice_callee" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "email_verifications_user_idx";--> statement-breakpoint
DROP INDEX "messages_conversation_idx";--> statement-breakpoint
DROP INDEX "posts_author_idx";--> statement-breakpoint
DROP INDEX "posts_community_idx";--> statement-breakpoint
ALTER TABLE "call_signals" ADD CONSTRAINT "call_signals_caller_id_users_id_fk" FOREIGN KEY ("caller_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_signals" ADD CONSTRAINT "call_signals_callee_id_users_id_fk" FOREIGN KEY ("callee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "call_signals_callee_idx" ON "call_signals" USING btree ("callee_id","status");--> statement-breakpoint
CREATE INDEX "call_signals_updated_idx" ON "call_signals" USING btree ("updated_at");--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_parent_id_posts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "communities_scope_idx" ON "communities" USING btree ("scope","scope_ref_id");--> statement-breakpoint
CREATE INDEX "conversation_members_user_idx" ON "conversation_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_verifications_expires_idx" ON "email_verifications" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "follows_followee_idx" ON "follows" USING btree ("followee_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "nin_log_user_idx" ON "nin_verification_log" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "post_reactions_user_idx" ON "post_reactions" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "posts_parent_idx" ON "posts" USING btree ("parent_id","created_at") WHERE parent_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "profiles_state_idx" ON "profiles" USING btree ("state_id");--> statement-breakpoint
CREATE INDEX "profiles_lga_idx" ON "profiles" USING btree ("lga_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "email_verifications_user_idx" ON "email_verifications" USING btree ("user_id") WHERE consumed_at IS NULL;--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "posts_author_idx" ON "posts" USING btree ("author_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "posts_community_idx" ON "posts" USING btree ("community_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "polling_units" ADD CONSTRAINT "polling_units_ward_id_code_unique" UNIQUE("ward_id","code");--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_no_self" CHECK (follower_id <> followee_id);