CREATE TABLE "coordinator_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level" "structure_level" NOT NULL,
	"role_key" text NOT NULL,
	"author_title" text NOT NULL,
	"jurisdiction" text NOT NULL,
	"state_id" uuid,
	"lga_id" uuid,
	"ward" text,
	"body" text NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coordinator_activities" ADD CONSTRAINT "coordinator_activities_state_id_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coordinator_activities" ADD CONSTRAINT "coordinator_activities_lga_id_lgas_id_fk" FOREIGN KEY ("lga_id") REFERENCES "public"."lgas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coordinator_activities_geo_idx" ON "coordinator_activities" USING btree ("level","state_id","lga_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "coordinator_activities_recent_idx" ON "coordinator_activities" USING btree ("created_at" DESC NULLS LAST);