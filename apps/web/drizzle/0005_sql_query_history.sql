CREATE TABLE IF NOT EXISTS "_postbase"."sql_queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"sql" text NOT NULL,
	"name" text,
	"visibility" text DEFAULT 'private' NOT NULL,
	"executed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sql_queries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "_postbase"."projects"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sql_queries_project_idx" ON "_postbase"."sql_queries" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sql_queries_executed_at_idx" ON "_postbase"."sql_queries" USING btree ("executed_at");
