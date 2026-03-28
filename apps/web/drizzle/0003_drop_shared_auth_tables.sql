-- Migration 0003: Drop shared auth tables from _postbase schema
-- Users, accounts, sessions, and verification_tokens now live in per-project
-- schemas (proj_<uuid>) as isolated tables. This migration removes the shared
-- versions and the FK constraints that reference them.
--
-- IMPORTANT: Run a data migration BEFORE this in production to copy existing
-- user data into per-project schemas. Fresh installs are safe to run as-is.

-- 1. Drop FK from storage_objects → users (cross-schema FK no longer valid)
ALTER TABLE "_postbase"."storage_objects"
  DROP CONSTRAINT IF EXISTS "storage_objects_owner_id_users_id_fk";

-- 2. Drop FK from audit_logs → users
ALTER TABLE "_postbase"."audit_logs"
  DROP CONSTRAINT IF EXISTS "audit_logs_user_id_users_id_fk";

-- 3. Drop tables in dependency order (accounts/sessions FK to users first)
DROP TABLE IF EXISTS "_postbase"."accounts";
DROP TABLE IF EXISTS "_postbase"."sessions";
DROP TABLE IF EXISTS "_postbase"."verification_tokens";
DROP TABLE IF EXISTS "_postbase"."users";
