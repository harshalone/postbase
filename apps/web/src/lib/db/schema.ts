import {
  pgSchema,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  primaryKey,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Internal postbase schema ─────────────────────────────────────────────────

export const postbaseSchema = pgSchema("_postbase");

// Organisations — group projects together
export const organisations = postbaseSchema.table("organisations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Projects — one postbase instance can serve multiple projects
export const projects = postbaseSchema.table("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  organisationId: uuid("organisation_id").references(() => organisations.id, {
    onDelete: "cascade",
  }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  anonKey: text("anon_key").notNull().unique(),
  serviceRoleKey: text("service_role_key").notNull().unique(),
  databaseUrl: text("database_url"), // optional: per-project DB
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Auth tables (NextAuth / Auth.js compatible) ──────────────────────────────

export const users = postbaseSchema.table("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name"),
  email: text("email").notNull(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  passwordHash: text("password_hash"),
  phone: text("phone"),
  phoneVerified: timestamp("phone_verified", { mode: "date" }),
  isAnonymous: boolean("is_anonymous").default(false),
  metadata: jsonb("metadata").default({}),
  bannedAt: timestamp("banned_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const accounts = postbaseSchema.table(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refreshToken: text("refresh_token"),
    accessToken: text("access_token"),
    expiresAt: integer("expires_at"),
    tokenType: text("token_type"),
    scope: text("scope"),
    idToken: text("id_token"),
    sessionState: text("session_state"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.provider, t.providerAccountId] }),
    userIdx: index("accounts_user_idx").on(t.userId),
  })
);

export const sessions = postbaseSchema.table(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionToken: text("session_token").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("sessions_user_idx").on(t.userId),
  })
);

export const verificationTokens = postbaseSchema.table(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.identifier, t.token] }),
  })
);

// ─── Provider configuration ───────────────────────────────────────────────────

export const providerConfigs = postbaseSchema.table(
  "provider_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // 'github', 'google', 'credentials', etc.
    enabled: boolean("enabled").default(false).notNull(),
    clientId: text("client_id"),
    clientSecret: text("client_secret"),
    // Extra config per provider (e.g. SAML metadata URL, SMS API key)
    config: jsonb("config").default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    projectProviderUnique: index("provider_configs_project_provider_idx").on(
      t.projectId,
      t.provider
    ),
  })
);

// ─── Storage ──────────────────────────────────────────────────────────────────

export const storageBuckets = postbaseSchema.table("storage_buckets", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  public: boolean("public").default(false).notNull(),
  fileSizeLimit: integer("file_size_limit"), // bytes, null = unlimited
  allowedMimeTypes: text("allowed_mime_types").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const storageObjects = postbaseSchema.table(
  "storage_objects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bucketId: uuid("bucket_id")
      .notNull()
      .references(() => storageBuckets.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    ownerId: uuid("owner_id").references(() => users.id, {
      onDelete: "set null",
    }),
    size: integer("size").notNull(),
    mimeType: text("mime_type"),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    bucketIdx: index("storage_objects_bucket_idx").on(t.bucketId),
  })
);

// ─── External storage connections ─────────────────────────────────────────────

export const storageConnections = postbaseSchema.table(
  "storage_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    provider: text("provider").notNull(), // 's3' | 'r2' | 'gcs' | 'backblaze'
    bucket: text("bucket").notNull(),
    region: text("region"),
    endpoint: text("endpoint"), // custom endpoint for R2/Backblaze/MinIO
    accessKeyId: text("access_key_id").notNull(),
    secretAccessKey: text("secret_access_key").notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    projectIdx: index("storage_connections_project_idx").on(t.projectId),
  })
);

// ─── Email settings ───────────────────────────────────────────────────────────

export const emailSettings = postbaseSchema.table("email_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" })
    .unique(),
  provider: text("provider").notNull().default("smtp"), // 'smtp' | 'ses'
  // SMTP fields
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port"),
  smtpUser: text("smtp_user"),
  smtpPassword: text("smtp_password"),
  smtpSecure: boolean("smtp_secure").default(true),
  smtpFrom: text("smtp_from"),
  // AWS SES fields
  sesRegion: text("ses_region"),
  sesAccessKeyId: text("ses_access_key_id"),
  sesSecretAccessKey: text("ses_secret_access_key"),
  sesFrom: text("ses_from"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Email templates ──────────────────────────────────────────────────────────

export const emailTemplates = postbaseSchema.table(
  "email_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // 'magic_link' | 'otp'
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    projectTypeUnique: index("email_templates_project_type_idx").on(
      t.projectId,
      t.type
    ),
  })
);

// ─── Audit logs ───────────────────────────────────────────────────────────────

export const auditLogs = postbaseSchema.table(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(), // 'auth.login', 'db.query', 'storage.upload'
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    projectIdx: index("audit_logs_project_idx").on(t.projectId),
    createdAtIdx: index("audit_logs_created_at_idx").on(t.createdAt),
  })
);

// ─── Admin users (dashboard access, not project-scoped) ───────────────────────

export const adminUsers = postbaseSchema.table("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  mustChangeCredentials: boolean("must_change_credentials").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Relations ────────────────────────────────────────────────────────────────

export const organisationsRelations = relations(organisations, ({ many }) => ({
  projects: many(projects),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [projects.organisationId],
    references: [organisations.id],
  }),
  users: many(users),
  sessions: many(sessions),
  providerConfigs: many(providerConfigs),
  storageBuckets: many(storageBuckets),
  storageConnections: many(storageConnections),
  auditLogs: many(auditLogs),
  emailSettings: one(emailSettings, {
    fields: [projects.id],
    references: [emailSettings.projectId],
  }),
  emailTemplates: many(emailTemplates),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  project: one(projects, { fields: [users.projectId], references: [projects.id] }),
  accounts: many(accounts),
  sessions: many(sessions),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
  project: one(projects, { fields: [sessions.projectId], references: [projects.id] }),
}));
