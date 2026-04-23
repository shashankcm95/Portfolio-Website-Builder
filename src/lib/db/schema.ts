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
  // Phase 3.5 — Bring-your-own-key LLM provider. All columns nullable:
  //   `null` everywhere = no BYOK; factory falls back to platform env.
  //   `byokKeyEncrypted` is AES-256-GCM ciphertext via `src/lib/crypto/secret-box`.
  byokProvider: text("byok_provider"), // "openai" | "anthropic"
  byokKeyEncrypted: text("byok_key_encrypted"),
  byokModel: text("byok_model"),
  byokKeyLastValidatedAt: timestamp("byok_key_last_validated_at", {
    withTimezone: true,
  }),
  byokKeyLastFailureAt: timestamp("byok_key_last_failure_at", {
    withTimezone: true,
  }),
  byokKeyLastFailureReason: text("byok_key_last_failure_reason"),
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
    // Phase 5 — visitor chatbot toggle. Default-on for new portfolios; the
    // published static site's embed script is gated on this + env +
    // at-least-one embedding row. Owners can flip off in settings.
    chatbotEnabled: boolean("chatbot_enabled").notNull().default(true),
    // Phase 5.2 — owner-authored greeting (first assistant message when
    // the visitor opens the widget). Null = use generic placeholder.
    chatbotGreeting: text("chatbot_greeting"),
    // Phase 5.2 — up to 3 starter-question chips shown above the input
    // on an empty transcript. Empty array = no chips.
    chatbotStarters: jsonb("chatbot_starters").notNull().default("[]"),
    // Phase 9 — when true, the publisher bakes a Cloudflare Pages Function
    // + RAG corpus + static iframe UI into the Pages deploy so the chatbot
    // runs fully standalone on the published site. When false (default),
    // the iframe still points at the builder. Opt-in so existing
    // published portfolios don't change behavior.
    selfHostedChatbot: boolean("self_hosted_chatbot").notNull().default(false),
    // Phase A — sharp one-line positioning statement shown in the hero
    // ("I build accessible, pixel-perfect experiences"). When null the
    // template falls back to the resume-derived label. User-authored text,
    // Tier 1 in the editability model — direct editable.
    positioning: text("positioning"),
    // Phase A — recognizable employer/client brand names ["Apple", "Klaviyo"]
    // rendered as a "Previously at" line in the hero. User-authored list,
    // Tier 1. Empty array = no hero line.
    namedEmployers: jsonb("named_employers").notNull().default("[]"),
    // Phase A — hiring status controls whether (and how) a hire-me CTA is
    // rendered in the hero. One of "available" | "open" | "not-looking".
    // Default "not-looking" keeps existing portfolios visually unchanged.
    hireStatus: text("hire_status").notNull().default("not-looking"),
    // Phase A — user-authored CTA copy ("Hire me", "Available for Q2"). Null
    // when hireStatus is "not-looking" or when the template's default copy
    // is fine.
    hireCtaText: text("hire_cta_text"),
    // Phase A — destination for the hire CTA (mailto:, calendar link, contact
    // form URL). Null = template falls back to the contact page.
    hireCtaHref: text("hire_cta_href"),
    // Phase A — user override for the anchor stat (the single strongest
    // credential the hero leads with). Phase B fills in a pipeline-computed
    // default; this column lets the user override with one of the ranked
    // candidates (Tier 3 — choose, not type-freely). Shape:
    //   { value: "4k+", unit: "GitHub stars", context?: string, sourceRef?: string }
    anchorStatOverride: jsonb("anchor_stat_override"),
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
  // Nullable — manual projects (sourceType = "manual") have no GitHub repo
  repoUrl: text("repo_url"),
  repoOwner: text("repo_owner"),
  repoName: text("repo_name"),
  displayName: text("display_name"),
  displayOrder: integer("display_order").default(0),
  isVisible: boolean("is_visible").default(true),
  isFeatured: boolean("is_featured").default(false),
  repoMetadata: jsonb("repo_metadata"),
  // Wave 3B: non-GitHub projects (design work, NDA case studies, etc.)
  sourceType: text("source_type").notNull().default("github"),
  manualDescription: text("manual_description"),
  imageUrl: text("image_url"),
  externalUrl: text("external_url"),
  techStack: jsonb("tech_stack").default("[]"),
  pipelineStatus: text("pipeline_status").default("pending"),
  pipelineError: text("pipeline_error"),
  lastAnalyzed: timestamp("last_analyzed", { withTimezone: true }),
  // Phase 1: Credibility Signals — data-only trust floor sourced from GitHub REST API.
  // Bundle is always read together; jsonb keeps iteration flexible without migrations.
  credibilitySignals: jsonb("credibility_signals"),
  credibilityFetchedAt: timestamp("credibility_fetched_at", {
    withTimezone: true,
  }),
  // Phase 8 — Coaching, not grading.
  // projectCategory: one of personal_learning | personal_tool | oss_author |
  // oss_contributor | unspecified. Set by the classifier on first credibility
  // fetch; overridable by the owner via the coaching PATCH endpoint. Enum-
  // validated in app code (src/lib/credibility/types.ts :: RepoCategory).
  projectCategory: text("project_category").default("unspecified"),
  // Which category was assigned automatically vs manually overridden. "auto"
  // means the classifier can re-run and adjust on next fetch; "manual" sticks.
  projectCategorySource: text("project_category_source").default("auto"),
  // String IDs of improvement suggestions the owner has dismissed inline.
  // The suggestion module owns the ID namespace (suggestions.ts).
  dismissedSuggestions: jsonb("dismissed_suggestions").default("[]"),
  // When true, profile-data.ts bakes a one-line project characterization into
  // the rendered portfolio. Defaults off; the UI flips it on for flattering
  // categories (personal_tool, oss_author) at classification time.
  showCharacterizationOnPortfolio: boolean(
    "show_characterization_on_portfolio"
  ).default(false),
  // Phase A — quantified outcomes extracted from README/commits by Phase B's
  // fact-extract step (category "outcome"). Shape: array of
  //   { metric, value, context?, evidenceRef? }
  // Surfaces in the project card + detail page. Tier 3 in the editability
  // model — values stay tied to extracted facts; user may hide entries or
  // edit only the `context` phrasing. Empty array default keeps existing
  // projects unchanged.
  outcomes: jsonb("outcomes").notNull().default("[]"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ─── Testimonials (Phase A) ──────────────────────────────────────────────────
//
// User-curated testimonials with named authors. Tier 1 content — fully
// editable by the user because the quote is attributed to a named third
// party who takes responsibility for the claim. No pipeline involvement;
// users paste a LinkedIn recommendation or direct quote into the editor.

export const testimonials = pgTable(
  "testimonials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    quote: text("quote").notNull(),
    authorName: text("author_name").notNull(),
    authorTitle: text("author_title"),
    authorCompany: text("author_company"),
    authorUrl: text("author_url"),
    avatarUrl: text("avatar_url"),
    displayOrder: integer("display_order").notNull().default(0),
    isVisible: boolean("is_visible").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    portfolioIdIdx: index("testimonials_portfolio_id_idx").on(
      table.portfolioId
    ),
  })
);

// ─── Project Demos (Phase 4) ─────────────────────────────────────────────────
//
// Zero-or-more ordered demo rows per project. `type` is a cached DemoType
// stamped at save time by `src/lib/demos/platform-detect.ts`. A project's
// rendered demo is derived from the full list via `toRenderMode` — single
// URL or an image/GIF slideshow.

export const projectDemos = pgTable(
  "project_demos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    type: text("type").notNull(), // DemoType: youtube/loom/vimeo/video/image/gif/other
    title: text("title"), // optional, ≤120 chars
    order: integer("order").notNull(), // 0-indexed slide position
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    // Phase 4.2 — oEmbed enrichment cache. Populated best-effort after
    // PUT /demo within a 3s window; null means "not yet enriched" (or
    // provider unreachable, or non-oEmbedable type).
    thumbnailUrl: text("thumbnail_url"),
    oembedTitle: text("oembed_title"),
    oembedFetchedAt: timestamp("oembed_fetched_at", { withTimezone: true }),
  },
  (t) => ({
    projectIdIdx: index("project_demos_project_id_idx").on(t.projectId),
    projectIdOrderIdx: uniqueIndex("project_demos_project_id_order_idx").on(
      t.projectId,
      t.order
    ),
  })
);

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
    // Phase 10 — owner-edited facts. Inline edit via <FactEditInline>
    // flips this to true; downstream narrative-regeneration treats
    // edited facts as canonical. Last-write-wins — no edit history.
    ownerEdited: boolean("owner_edited").notNull().default(false),
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
    // Phase 9 — cached BGE embedding for the chatbot self-host flow.
    // Shape: { hash: string, vector: number[] }. Hash is sha256 of
    // chunkText; unchanged chunks skip re-embedding on subsequent
    // publishes. Null until the first self-hosted publish touches this
    // row. The builder-side chatbot does NOT read this column — only the
    // publisher's cf-embed.ts does.
    embeddingBge: jsonb("embedding_bge"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    projectIdIdx: index("embeddings_project_id_idx").on(table.projectId),
  })
);

// ─── Chatbot Sessions ────────────────────────────────────────────────────────

export const chatbotSessions = pgTable(
  "chatbot_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    visitorId: text("visitor_id"),
    messages: jsonb("messages").default("[]"),
    metadata: jsonb("metadata").default("{}"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    portfolioIdIdx: index("chatbot_sessions_portfolio_id_idx").on(
      table.portfolioId
    ),
    // Phase 5 — lets POST /api/chatbot/message upsert the row for a
    // (portfolio, visitor) pair without a secondary lookup.
    portfolioVisitorIdx: index("chatbot_sessions_portfolio_visitor_idx").on(
      table.portfolioId,
      table.visitorId
    ),
  })
);

// ─── Phase 6 — Share Tokens ─────────────────────────────────────────────────

/**
 * Unauthenticated share links for draft portfolios. Owner generates a
 * token; anyone holding the URL `/share/<token>` sees a read-only
 * preview of the portfolio (even unpublished drafts). Soft-revocable
 * via `revokedAt`; optional `expiresAt` for time-bounded shares.
 */
export const shareTokens = pgTable(
  "share_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    // 24-char Crockford base32, unique across the whole table.
    token: text("token").notNull().unique(),
    // Optional owner-authored nickname ("for Jane Doe", "interview prep").
    label: text("label"),
    // Null = never expires.
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    // Null = still active. Soft-revoke instead of delete so we keep the
    // view-count history the owner might care about.
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    viewCount: integer("view_count").notNull().default(0),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    portfolioIdIdx: index("share_tokens_portfolio_id_idx").on(
      table.portfolioId
    ),
  })
);

// ─── Phase 6 — Visitor Events ───────────────────────────────────────────────

/**
 * Lightweight pageview / chatbot analytics on published portfolios.
 * No visitorId, no IP, no cookie — only coarse user-agent bucket +
 * 2-char country from Cloudflare's `CF-IPCountry`. Owners see aggregate
 * pageview counts + top paths + top referrers in the Analytics tab.
 */
export const visitorEvents = pgTable(
  "visitor_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    // "pageview" | "chatbot_opened" | "chatbot_message"
    eventType: text("event_type").notNull(),
    path: text("path"),
    // Sanitized Referer header (origin only — strip query strings).
    referrer: text("referrer"),
    // "desktop" | "mobile" | "bot" | "other"
    userAgentBucket: text("user_agent_bucket"),
    // 2-char ISO country code (nullable when CF header absent).
    country: text("country"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    portfolioCreatedIdx: index("visitor_events_portfolio_created_idx").on(
      table.portfolioId,
      table.createdAt
    ),
  })
);

// ─── Phase 6 — Pipeline Jobs (history) ──────────────────────────────────────

/**
 * Durable history of pipeline orchestrator runs. One row per
 * `startPipeline(projectId)`. Lives alongside the existing in-memory
 * orchestrator state so observability can persist restarts without
 * the pipeline becoming DB-coupled. All writes are fire-and-forget.
 */
export const pipelineJobs = pgTable(
  "pipeline_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Matches the orchestrator's in-memory jobId (a UUID).
    jobId: text("job_id").notNull().unique(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // "running" | "completed" | "failed"
    status: text("status").notNull(),
    error: text("error"),
    // Phase R1 — every writer (history.ts) passes this explicitly, but the
    // default-now makes the column migration-safe: if the column is added
    // to an existing DB with rows, the default back-fills cleanly.
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    projectIdIdx: index("pipeline_jobs_project_id_idx").on(table.projectId),
    createdAtIdx: index("pipeline_jobs_created_at_idx").on(table.createdAt),
  })
);

/**
 * One row per step within a pipeline job. Captures timing + LLM usage
 * + cost (in micro-USD to stay integer-safe). `jobId` is an app-level
 * FK to `pipelineJobs.jobId` (not a Drizzle relation — keeps writes
 * trivially decoupled from the orchestrator's state machine).
 */
export const pipelineStepRuns = pgTable(
  "pipeline_step_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: text("job_id").notNull(),
    stepName: text("step_name").notNull(),
    // "pending" | "running" | "completed" | "failed" | "skipped"
    status: text("status").notNull(),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    // LLM usage when the step made a provider call. Null when the step
    // is pure code (e.g., repo_fetch).
    modelUsed: text("model_used"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    // Cost in micro-USD (1e-6 USD). Integer avoids float drift across
    // aggregation. UI presents as USD with 4 decimals.
    costUsdMicros: integer("cost_usd_micros"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    jobIdIdx: index("pipeline_step_runs_job_id_idx").on(table.jobId),
  })
);

// ─── Phase 7 — Layout Reviews ───────────────────────────────────────────────

/**
 * On-demand layout review of a portfolio's rendered HTML. One row per
 * review run; issues live in `layoutReviewIssues` for queryability.
 */
export const layoutReviews = pgTable(
  "layout_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    templateId: text("template_id").notNull(),
    // "running" | "completed" | "failed"
    status: text("status").notNull(),
    // 0-100 composite. Null while running.
    score: integer("score"),
    // Did the Playwright-backed Tier 2 checks run?
    tier2Available: boolean("tier2_available").notNull().default(false),
    // Did the AI vision Tier 3 review run?
    tier3Available: boolean("tier3_available").notNull().default(false),
    // Tier 3 narrative summary (Claude-generated).
    aiSummary: text("ai_summary"),
    error: text("error"),
    // Phase R1 — default-now for migration safety; see pipeline_jobs note.
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    portfolioIdx: index("layout_reviews_portfolio_id_idx").on(table.portfolioId),
    portfolioStatusIdx: index("layout_reviews_portfolio_status_idx").on(
      table.portfolioId,
      table.status
    ),
  })
);

/**
 * One row per individual issue surfaced by a review run. Severity
 * controls scoring weight; tier identifies which check produced it.
 */
export const layoutReviewIssues = pgTable(
  "layout_review_issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => layoutReviews.id, { onDelete: "cascade" }),
    // Stable identifier like "R10-hero-name-wraps" — keys to the rules table.
    rule: text("rule").notNull(),
    // "static" | "rendered" | "ai"
    tier: text("tier").notNull(),
    // "critical" | "warning" | "info"
    severity: text("severity").notNull(),
    message: text("message").notNull(),
    page: text("page"),
    viewport: integer("viewport"),
    elementSelector: text("element_selector"),
    details: jsonb("details"),
  },
  (table) => ({
    reviewIdIdx: index("layout_review_issues_review_id_idx").on(table.reviewId),
  })
);

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
  shareTokens: many(shareTokens),
  visitorEvents: many(visitorEvents),
  layoutReviews: many(layoutReviews),
  testimonials: many(testimonials),
}));

// Phase A — testimonials belong to one portfolio.
export const testimonialsRelations = relations(testimonials, ({ one }) => ({
  portfolio: one(portfolios, {
    fields: [testimonials.portfolioId],
    references: [portfolios.id],
  }),
}));

// Phase 7 — reverse relation for layout_reviews + cascade-style child rows.
export const layoutReviewsRelations = relations(layoutReviews, ({ one, many }) => ({
  portfolio: one(portfolios, {
    fields: [layoutReviews.portfolioId],
    references: [portfolios.id],
  }),
  issues: many(layoutReviewIssues),
}));

export const layoutReviewIssuesRelations = relations(layoutReviewIssues, ({ one }) => ({
  review: one(layoutReviews, {
    fields: [layoutReviewIssues.reviewId],
    references: [layoutReviews.id],
  }),
}));

// Phase 6 — reverse relations for the new tables.
export const shareTokensRelations = relations(shareTokens, ({ one }) => ({
  portfolio: one(portfolios, {
    fields: [shareTokens.portfolioId],
    references: [portfolios.id],
  }),
}));

export const visitorEventsRelations = relations(visitorEvents, ({ one }) => ({
  portfolio: one(portfolios, {
    fields: [visitorEvents.portfolioId],
    references: [portfolios.id],
  }),
}));

export const pipelineJobsRelations = relations(pipelineJobs, ({ one }) => ({
  project: one(projects, {
    fields: [pipelineJobs.projectId],
    references: [projects.id],
  }),
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
