CREATE TABLE IF NOT EXISTS "_postbase"."email_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"provider" text DEFAULT 'smtp' NOT NULL,
	"smtp_host" text,
	"smtp_port" integer,
	"smtp_user" text,
	"smtp_password" text,
	"smtp_secure" boolean DEFAULT true,
	"smtp_from" text,
	"ses_region" text,
	"ses_access_key_id" text,
	"ses_secret_access_key" text,
	"ses_from" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_settings_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "_postbase"."email_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"type" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "_postbase"."email_settings" ADD CONSTRAINT "email_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "_postbase"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "_postbase"."email_templates" ADD CONSTRAINT "email_templates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "_postbase"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_templates_project_type_idx" ON "_postbase"."email_templates" USING btree ("project_id","type");
