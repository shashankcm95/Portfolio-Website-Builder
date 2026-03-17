import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type {
  users,
  portfolios,
  projects,
  repoSources,
  facts,
  derivedFacts,
  generatedSections,
  claimMap,
  templates,
  deployments,
  domains,
  embeddings,
  chatbotSessions,
} from "@/lib/db/schema";

// ─── Select types (for reading from DB) ─────────────────────────────────────

export type User = InferSelectModel<typeof users>;
export type Portfolio = InferSelectModel<typeof portfolios>;
export type Project = InferSelectModel<typeof projects>;
export type RepoSource = InferSelectModel<typeof repoSources>;
export type Fact = InferSelectModel<typeof facts>;
export type DerivedFact = InferSelectModel<typeof derivedFacts>;
export type GeneratedSection = InferSelectModel<typeof generatedSections>;
export type ClaimMap = InferSelectModel<typeof claimMap>;
export type Template = InferSelectModel<typeof templates>;
export type Deployment = InferSelectModel<typeof deployments>;
export type Domain = InferSelectModel<typeof domains>;
export type Embedding = InferSelectModel<typeof embeddings>;
export type ChatbotSession = InferSelectModel<typeof chatbotSessions>;

// ─── Insert types (for writing to DB) ───────────────────────────────────────

export type NewUser = InferInsertModel<typeof users>;
export type NewPortfolio = InferInsertModel<typeof portfolios>;
export type NewProject = InferInsertModel<typeof projects>;
export type NewRepoSource = InferInsertModel<typeof repoSources>;
export type NewFact = InferInsertModel<typeof facts>;
export type NewDerivedFact = InferInsertModel<typeof derivedFacts>;
export type NewGeneratedSection = InferInsertModel<typeof generatedSections>;
export type NewClaimMap = InferInsertModel<typeof claimMap>;
export type NewTemplate = InferInsertModel<typeof templates>;
export type NewDeployment = InferInsertModel<typeof deployments>;
export type NewDomain = InferInsertModel<typeof domains>;
export type NewEmbedding = InferInsertModel<typeof embeddings>;
export type NewChatbotSession = InferInsertModel<typeof chatbotSessions>;
