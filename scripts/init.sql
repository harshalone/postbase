-- Create postbase internal schema
CREATE SCHEMA IF NOT EXISTS _postbase;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
-- pg_cron and pgmq are optional — install via the Integrations page in the dashboard
