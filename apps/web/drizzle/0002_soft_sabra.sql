ALTER TABLE "_postbase"."email_settings" ADD COLUMN IF NOT EXISTS "ses_smtp_username" text;--> statement-breakpoint
ALTER TABLE "_postbase"."email_settings" ADD COLUMN IF NOT EXISTS "ses_smtp_password" text;
