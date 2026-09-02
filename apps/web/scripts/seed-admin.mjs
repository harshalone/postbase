#!/usr/bin/env node
/**
 * Seed the default admin user for the Postbase dashboard.
 * Idempotent — safe to run multiple times (uses ON CONFLICT DO UPDATE).
 *
 * Override via env vars to avoid the well-known default credentials:
 *   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD
 *
 * Falls back to the documented defaults (must-change-credentials is then
 * forced on, so the operator is prompted to set their own on first login):
 *   Email:    admin@getpostbase.com
 *   Password: postbase
 */

import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postbase:postbase@localhost:5432/postbase";

const usingDefaults = !process.env.SEED_ADMIN_EMAIL && !process.env.SEED_ADMIN_PASSWORD;
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@getpostbase.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "postbase";

const pool = new Pool({ connectionString: DATABASE_URL });

try {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  // Only force a credential change when the well-known defaults are in use —
  // an operator-supplied email/password is assumed intentional.
  const mustChangeCredentials = usingDefaults;

  await pool.query(
    `INSERT INTO _postbase.admin_users (email, password_hash, must_change_credentials)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, must_change_credentials = EXCLUDED.must_change_credentials`,
    [ADMIN_EMAIL, passwordHash, mustChangeCredentials]
  );

  console.log("✔ Admin user ready:", ADMIN_EMAIL);
  if (usingDefaults) {
    console.log("  Using default credentials — set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to override.");
  }
} catch (err) {
  console.error("✖ Failed to seed admin user:", err.message);
  process.exit(1);
} finally {
  await pool.end();
}
