CREATE SCHEMA "_postbase";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "_postbase"."accounts" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "_postbase"."audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE IF NOT EXISTS "_postbase"."organisations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organisations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "_postbase"."projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"anon_key" text NOT NULL,
	"service_role_key" text NOT NULL,
	"database_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "projects_slug_unique" UNIQUE("slug"),
	CONSTRAINT "projects_anon_key_unique" UNIQUE("anon_key"),
	CONSTRAINT "projects_service_role_key_unique" UNIQUE("service_role_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "_postbase"."provider_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"client_id" text,
	"client_secret" text,
	"config" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "_postbase"."sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_token" text NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"expires" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_session_token_unique" UNIQUE("session_token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "_postbase"."storage_buckets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"public" boolean DEFAULT false NOT NULL,
	"file_size_limit" integer,
	"allowed_mime_types" text[],
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "_postbase"."storage_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"bucket" text NOT NULL,
	"region" text,
	"endpoint" text,
	"access_key_id" text NOT NULL,
	"secret_access_key" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "_postbase"."storage_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bucket_id" uuid NOT NULL,
	"name" text NOT NULL,
	"owner_id" uuid,
	"size" integer NOT NULL,
	"mime_type" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "_postbase"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp,
	"image" text,
	"password_hash" text,
	"phone" text,
	"phone_verified" timestamp,
	"is_anonymous" boolean DEFAULT false,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"banned_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "_postbase"."verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "_postbase"."accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "_postbase"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "_postbase"."audit_logs" ADD CONSTRAINT "audit_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "_postbase"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "_postbase"."audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "_postbase"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
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
DO $$ BEGIN
 ALTER TABLE "_postbase"."projects" ADD CONSTRAINT "projects_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "_postbase"."organisations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "_postbase"."provider_configs" ADD CONSTRAINT "provider_configs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "_postbase"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "_postbase"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "_postbase"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "_postbase"."sessions" ADD CONSTRAINT "sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "_postbase"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "_postbase"."storage_buckets" ADD CONSTRAINT "storage_buckets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "_postbase"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "_postbase"."storage_connections" ADD CONSTRAINT "storage_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "_postbase"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "_postbase"."storage_objects" ADD CONSTRAINT "storage_objects_bucket_id_storage_buckets_id_fk" FOREIGN KEY ("bucket_id") REFERENCES "_postbase"."storage_buckets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "_postbase"."storage_objects" ADD CONSTRAINT "storage_objects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "_postbase"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "_postbase"."users" ADD CONSTRAINT "users_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "_postbase"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounts_user_idx" ON "_postbase"."accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_project_idx" ON "_postbase"."audit_logs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx" ON "_postbase"."audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_templates_project_type_idx" ON "_postbase"."email_templates" USING btree ("project_id","type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_configs_project_provider_idx" ON "_postbase"."provider_configs" USING btree ("project_id","provider");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_user_idx" ON "_postbase"."sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "storage_connections_project_idx" ON "_postbase"."storage_connections" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "storage_objects_bucket_idx" ON "_postbase"."storage_objects" USING btree ("bucket_id");