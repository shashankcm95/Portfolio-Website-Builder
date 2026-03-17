import { relations } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  real,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ─── Users ───────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  githubId: text("github_id").unique().notNull(),
  email: text("email").unique(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  githubUsername: text("github_username").notNull(),
  githubToken: text("github_token"),
  resumeRawText: text("resume_raw_text"),
  resumeJson: jsonb("resume_json"),
  resumeFilename: text("resume_filename"),
  onboardingStep: text("onboarding_step").default("initial"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ─── Portfolios ──────────────────────────────────────────────────────────────

export const portfolios = pgTable(
  "portfolios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    templateId: text("template_id").notNull().default("minimal"),
    profileData: jsonb("profile_data"),
    status: text("status").default("draft"),
    settings: jsonb("settings").default("{}"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    userSlugUnique: uniqueIndex("portfolios_user_id_slug_unique").on(
      table.userId,
      table.slug
    ),
  })
);

// ─── Projects ────────────────────────────────────────────────────────────────

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  portfolioId: uuid("portfolio_id")
    .notNull()
    .references(() => portfolios.id, { onDelete: "cascade" }),
  repoUrl: text("repo_url").notNull(),
  repoOwner: text("repo_owner").notNull(),
  repoName: text("repo_name").notNull(),
  displayName: text("display_name"),
  displayOrder: integer("display_order").default(0),
  isVisible: boolean("is_visible").default(true),
  isFeatured: boolean("is_featured").default(false),
  repoMetadata: jsonb("repo_metadata"),
  pipelineStatus: text("pipeline_status").default("pending"),
  pipelineError: text("pipeline_error"),
  lastAnalyzed: timestamp("last_analyzed", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ─── Repo Sources ────────────────────────────────────────────────────────────

export const repoSources = pgTable(
  "repo_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull(),
    content: text("content"),
    contentHash: text("content_hash"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow(),
    metadata: jsonb("metadata").default("{}"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    projectIdIdx: index("repo_sources_project_id_idx").on(table.projectId),
  })
);

// ─── Facts ───────────────────────────────────────────────────────────────────

export const facts = pgTable(
  "facts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    claim: text("claim").notNull(),
    category: text("category").notNull(),
    confidence: real("confidence").notNull().default(0.8),
    evidenceType: text("evidence_type").notNull(),
    evidenceRef: text("evidence_ref"),
    evidenceText: text("evidence_text"),
    sourceId: uuid("source_id").references(() => repoSources.id),
    isVerified: boolean("is_verified").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    projectIdIdx: index("facts_project_id_idx").on(table.projectId),
    categoryIdx: index("facts_category_idx").on(table.category),
  })
);

// ─── Derived Facts ───────────────────────────────────────────────────────────

export const derivedFacts = pgTable("derived_facts", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  claim: text("claim").notNull(),
  derivationRule: text("derivation_rule").notNull(),
  sourceFactIds: text("source_fact_ids").notNull(),
  confidence: real("confidence").notNull().default(0.7),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── Generated Sections ──────────────────────────────────────────────────────

export const generatedSections = pgTable(
  "generated_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sectionType: text("section_type").notNull(),
    variant: text("variant").notNull().default("recruiter"),
    content: text("content").notNull(),
    version: integer("version").notNull().default(1),
    isUserEdited: boolean("is_user_edited").default(false),
    userContent: text("user_content"),
    modelUsed: text("model_used"),
    promptHash: text("prompt_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    projectIdIdx: index("generated_sections_project_id_idx").on(
      table.projectId
    ),
    sectionUniqueIdx: uniqueIndex(
      "generated_sections_project_section_variant_version_unique"
    ).on(table.projectId, table.sectionType, table.variant, table.version),
  })
);

// ─── Claim Map ───────────────────────────────────────────────────────────────

export const claimMap = pgTable(
  "claim_map",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => generatedSections.id, { onDelete: "cascade" }),
    sentenceIndex: integer("sentence_index").notNull(),
    sentenceText: text("sentence_text").notNull(),
    factIds: text("fact_ids").notNull(),
    verification: text("verification").notNull().default("pending"),
    confidence: real("confidence"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    sectionIdIdx: index("claim_map_section_id_idx").on(table.sectionId),
  })
);

// ─── Templates ───────────────────────────────────────────────────────────────

export const templates = pgTable("templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  previewUrl: text("preview_url"),
  isActive: boolean("is_active").default(true),
  isPremium: boolean("is_premium").default(false),
  config: jsonb("config").default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── Deployments ─────────────────────────────────────────────────────────────

export const deployments = pgTable(
  "deployments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    cfProjectName: text("cf_project_name").notNull(),
    cfDeploymentId: text("cf_deployment_id"),
    status: text("status").notNull().default("pending"),
    url: text("url"),
    customDomain: text("custom_domain"),
    errorMessage: text("error_message"),
    deployedAt: timestamp("deployed_at", { withTimezone: true }),
    profileDataHash: text("profile_data_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    portfolioIdIdx: index("deployments_portfolio_id_idx").on(
      table.portfolioId
    ),
  })
);

// ─── Domains ─────────────────────────────────────────────────────────────────

export const domains = pgTable(
  "domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    domain: text("domain").notNull().unique(),
    verificationStatus: text("verification_status").default("pending"),
    sslStatus: text("ssl_status").default("pending"),
    dnsRecordType: text("dns_record_type").default("CNAME"),
    dnsTarget: text("dns_target"),
    lastChecked: timestamp("last_checked", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    portfolioIdIdx: index("domains_portfolio_id_idx").on(table.portfolioId),
  })
);

// ─── Embeddings ──────────────────────────────────────────────────────────────

export const embeddings = pgTable(
  "embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    chunkType: text("chunk_type").notNull(),
    chunkText: text("chunk_text").notNull(),
    sourceRef: text("source_ref"),
    embedding: text("embedding").notNull(),
    metadata: jsonb("metadata").default("{}"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    projectIdIdx: index("embeddings_project_id_idx").on(table.projectId),
  })
);

// ─── Chatbot Sessions ────────────────────────────────────────────────────────

export const chatbotSessions = pgTable("chatbot_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  portfolioId: uuid("portfolio_id")
    .notNull()
    .references(() => portfolios.id, { onDelete: "cascade" }),
  visitorId: text("visitor_id"),
  messages: jsonb("messages").default("[]"),
  metadata: jsonb("metadata").default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ─── Relations ───────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  portfolios: many(portfolios),
}));

export const portfoliosRelations = relations(portfolios, ({ one, many }) => ({
  user: one(users, {
    fields: [portfolios.userId],
    references: [users.id],
  }),
  projects: many(projects),
  deployments: many(deployments),
  domains: many(domains),
  chatbotSessions: many(chatbotSessions),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  portfolio: one(portfolios, {
    fields: [projects.portfolioId],
    references: [portfolios.id],
  }),
  repoSources: many(repoSources),
  facts: many(facts),
  derivedFacts: many(derivedFacts),
  generatedSections: many(generatedSections),
  embeddings: many(embeddings),
}));

export const repoSourcesRelations = relations(repoSources, ({ one }) => ({
  project: one(projects, {
    fields: [repoSources.projectId],
    references: [projects.id],
  }),
}));

export const factsRelations = relations(facts, ({ one }) => ({
  project: one(projects, {
    fields: [facts.projectId],
    references: [projects.id],
  }),
  source: one(repoSources, {
    fields: [facts.sourceId],
    references: [repoSources.id],
  }),
}));

export const derivedFactsRelations = relations(derivedFacts, ({ one }) => ({
  project: one(projects, {
    fields: [derivedFacts.projectId],
    references: [projects.id],
  }),
}));

export const generatedSectionsRelations = relations(
  generatedSections,
  ({ one, many }) => ({
    project: one(projects, {
      fields: [generatedSections.projectId],
      references: [projects.id],
    }),
    claimMaps: many(claimMap),
  })
);

export const claimMapRelations = relations(claimMap, ({ one }) => ({
  section: one(generatedSections, {
    fields: [claimMap.sectionId],
    references: [generatedSections.id],
  }),
}));

export const deploymentsRelations = relations(deployments, ({ one }) => ({
  portfolio: one(portfolios, {
    fields: [deployments.portfolioId],
    references: [portfolios.id],
  }),
}));

export const domainsRelations = relations(domains, ({ one }) => ({
  portfolio: one(portfolios, {
    fields: [domains.portfolioId],
    references: [portfolios.id],
  }),
}));

export const embeddingsRelations = relations(embeddings, ({ one }) => ({
  project: one(projects, {
    fields: [embeddings.projectId],
    references: [projects.id],
  }),
}));

export const chatbotSessionsRelations = relations(
  chatbotSessions,
  ({ one }) => ({
    portfolio: one(portfolios, {
      fields: [chatbotSessions.portfolioId],
      references: [portfolios.id],
    }),
  })
);
