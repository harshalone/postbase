ALTER TABLE "_postbase"."email_settings" ADD COLUMN IF NOT EXISTS "smtp_from_name" text;--> statement-breakpoint
ALTER TABLE "_postbase"."email_settings" ADD COLUMN IF NOT EXISTS "ses_from_name" text;
