CREATE TABLE "huddle_peers" (
	"huddle_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "huddle_peers_huddle_id_user_id_pk" PRIMARY KEY("huddle_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "huddle_signals" (
	"huddle_id" uuid NOT NULL,
	"a_id" uuid NOT NULL,
	"b_id" uuid NOT NULL,
	"offer" text,
	"answer" text,
	"ice_a" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ice_b" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "huddle_signals_huddle_id_a_id_b_id_pk" PRIMARY KEY("huddle_id","a_id","b_id"),
	CONSTRAINT "huddle_pair_ordered" CHECK (a_id < b_id)
);
--> statement-breakpoint
CREATE TABLE "huddles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"mode" text DEFAULT 'voice' NOT NULL,
	"started_by" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"media" text NOT NULL,
	"caption" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "huddle_peers" ADD CONSTRAINT "huddle_peers_huddle_id_huddles_id_fk" FOREIGN KEY ("huddle_id") REFERENCES "public"."huddles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "huddle_peers" ADD CONSTRAINT "huddle_peers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "huddle_signals" ADD CONSTRAINT "huddle_signals_huddle_id_huddles_id_fk" FOREIGN KEY ("huddle_id") REFERENCES "public"."huddles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "huddle_signals" ADD CONSTRAINT "huddle_signals_a_id_users_id_fk" FOREIGN KEY ("a_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "huddle_signals" ADD CONSTRAINT "huddle_signals_b_id_users_id_fk" FOREIGN KEY ("b_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "huddles" ADD CONSTRAINT "huddles_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "huddles" ADD CONSTRAINT "huddles_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "huddles_conversation_idx" ON "huddles" USING btree ("conversation_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "stories_user_idx" ON "stories" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "stories_created_idx" ON "stories" USING btree ("created_at");