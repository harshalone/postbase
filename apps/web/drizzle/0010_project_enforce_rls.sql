ALTER TABLE "_postbase"."projects" ADD COLUMN IF NOT EXISTS "enforce_rls" boolean DEFAULT false NOT NULL;
