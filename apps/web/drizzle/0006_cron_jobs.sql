CREATE TABLE IF NOT EXISTS "_postbase"."cron_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"schedule" text NOT NULL,
	"command" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "_postbase"."cron_job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"start_time" timestamp DEFAULT now() NOT NULL,
	"end_time" timestamp,
	"status" text DEFAULT 'running' NOT NULL,
	"return_message" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "_postbase"."cron_jobs" ADD CONSTRAINT "cron_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "_postbase"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "_postbase"."cron_job_runs" ADD CONSTRAINT "cron_job_runs_job_id_cron_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "_postbase"."cron_jobs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cron_jobs_project_idx" ON "_postbase"."cron_jobs" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cron_jobs_project_name_idx" ON "_postbase"."cron_jobs" USING btree ("project_id","name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cron_job_runs_job_idx" ON "_postbase"."cron_job_runs" USING btree ("job_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cron_job_runs_start_time_idx" ON "_postbase"."cron_job_runs" USING btree ("start_time");
