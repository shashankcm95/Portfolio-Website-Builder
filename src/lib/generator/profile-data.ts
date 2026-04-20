import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { embeddings, portfolios, projects } from "@/lib/db/schema";
import type {
  ProfileData,
  Project,
  Skill,
  SocialProfile,
  ProjectFact,
  Experience,
  Education,
} from "@/templates/_shared/types";

/**
 * Assemble a complete ProfileData object from the database.
 *
 * This queries all relevant tables and builds the contract that every
 * template receives as its sole data input.
 */
export async function assembleProfileData(
  portfolioId: string
): Promise<ProfileData> {
  // ── Fetch portfolio + user ──────────────────────────────────────────────
  const portfolio = await db.query.portfolios.findFirst({
    where: eq(portfolios.id, portfolioId),
    with: { user: true },
  });

  if (!portfolio) {
    throw new Error(`Portfolio not found: ${portfolioId}`);
  }

  const user = portfolio.user;

  // ── Fetch visible projects ordered by displayOrder ──────────────────────
  const projectRows = await db.query.projects.findMany({
    where: and(
      eq(projects.portfolioId, portfolioId),
      eq(projects.isVisible, true)
    ),
    orderBy: [projects.displayOrder],
    with: {
      facts: true,
      generatedSections: true,
    },
  });

  // ── Build skills from facts across all projects ─────────────────────────
  const skillsMap = new Map<string, Skill>();

  for (const proj of projectRows) {
    const projectName =
      proj.displayName || proj.repoName || "Unnamed Project";

    // Extract skills from facts with category "tech-stack" or "language"
    for (const fact of proj.facts) {
      const category = mapFactCategoryToSkillCategory(fact.category);
      if (category) {
        const existing = skillsMap.get(fact.claim.toLowerCase());
        if (existing) {
          existing.evidence = existing.evidence || [];
          existing.evidence.push({
            projectName,
            usage: fact.evidenceText || fact.claim,
          });
        } else {
          skillsMap.set(fact.claim.toLowerCase(), {
            name: fact.claim,
            category,
            evidence: [
              {
                projectName,
                usage: fact.evidenceText || fact.claim,
              },
            ],
          });
        }
      }
    }

    // Also extract skills from repo metadata topics
    const metadata = proj.repoMetadata as Record<string, unknown> | null;
    if (metadata?.topics && Array.isArray(metadata.topics)) {
      for (const topic of metadata.topics as string[]) {
        if (!skillsMap.has(topic.toLowerCase())) {
          skillsMap.set(topic.toLowerCase(), {
            name: topic,
            category: "other",
            evidence: [
              {
                projectName,
                usage: `Used in ${projectName}`,
              },
            ],
          });
        }
      }
    }
  }

  // ── Build project list ──────────────────────────────────────────────────
  const projectList: Project[] = projectRows.map((proj) =>
    buildProject(proj)
  );

  // ── Extract resume data if available ────────────────────────────────────
  const resumeJson = user.resumeJson as Record<string, unknown> | null;
  const experience = extractExperience(resumeJson);
  const education = extractEducation(resumeJson);

  // ── Build social profiles ──────────────────────────────────────────────
  const profiles = buildSocialProfiles(user);

  // ── Extract summary ────────────────────────────────────────────────────
  const summary = extractSummary(resumeJson, user);

  // ── Phase 5: chatbot gate ──────────────────────────────────────────────
  // The embed script is only injected when ALL of:
  //   (a) NEXT_PUBLIC_APP_URL is set (we need an origin to point the
  //       published site back at our app)
  //   (b) the owner has chatbotEnabled=true on the portfolio
  //   (c) at least one embedding row exists for this portfolio
  //       (prevents shipping a broken chatbot when the pipeline hasn't
  //        produced a retrieval corpus yet).
  const chatbotEmbed = await buildChatbotEmbed(portfolioId, portfolio);

  // ── Phase 6: dynamic OG image URL ──────────────────────────────────────
  // Only set when NEXT_PUBLIC_APP_URL is configured at build time. The
  // `v` cache-buster is derived from a content-hash proxy so social
  // scrapers fetch a fresh image after meaningful edits. Uses updatedAt
  // as the poor-man's hash — cheap, stable across same-state rebuilds.
  const ogImageUrl = buildOgImageUrl(portfolioId, portfolio.updatedAt);

  // ── Phase 6: analytics beacon ──────────────────────────────────────────
  // Same NEXT_PUBLIC_APP_URL gate — if we can't hit ourselves from the
  // published site, we don't inject the beacon script.
  const { analyticsEndpoint, analyticsPortfolioId } =
    buildAnalyticsConfig(portfolioId);

  // ── Assemble ProfileData ───────────────────────────────────────────────
  const profileData: ProfileData = {
    meta: {
      generatedAt: new Date().toISOString(),
      templateId: portfolio.templateId || "minimal",
      portfolioSlug: portfolio.slug,
      siteUrl: "",
      ogImageUrl,
      analyticsEndpoint,
      analyticsPortfolioId,
    },
    basics: {
      name: user.name || user.githubUsername || "Portfolio",
      label: extractLabel(resumeJson) || "Software Developer",
      email: user.email || undefined,
      url: `https://github.com/${user.githubUsername}`,
      summary,
      avatar: user.avatarUrl || undefined,
      profiles,
    },
    skills: Array.from(skillsMap.values()),
    projects: projectList,
    experience: experience.length > 0 ? experience : undefined,
    education: education.length > 0 ? education : undefined,
    chatbot: chatbotEmbed ?? undefined,
  };

  return profileData;
}

/**
 * Phase 6 — Build the dynamic OG image URL that the published site's
 * meta tags point at. Returns null when NEXT_PUBLIC_APP_URL isn't set
 * (template falls back to `basics.avatar`). The `v` cache-buster
 * encodes `portfolio.updatedAt` so social scrapers fetch a fresh image
 * after meaningful edits.
 */
function buildOgImageUrl(
  portfolioId: string,
  updatedAt: Date | null | undefined
): string | null {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "");
  if (!appUrl) return null;
  const v = updatedAt
    ? String(Math.floor(new Date(updatedAt).getTime() / 1000))
    : "0";
  return `${appUrl}/api/og?portfolioId=${encodeURIComponent(portfolioId)}&v=${v}`;
}

/**
 * Phase 6 — Analytics beacon endpoint + portfolio id. Both null when
 * NEXT_PUBLIC_APP_URL isn't set (template omits the script).
 */
function buildAnalyticsConfig(portfolioId: string): {
  analyticsEndpoint: string | null;
  analyticsPortfolioId: string | null;
} {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "");
  if (!appUrl) {
    return { analyticsEndpoint: null, analyticsPortfolioId: null };
  }
  return {
    analyticsEndpoint: `${appUrl}/api/events/track`,
    analyticsPortfolioId: portfolioId,
  };
}

/**
 * Resolve the ProfileData.chatbot block if (and only if) the gates pass.
 * Returns null when any gate fails — template then omits the script.
 */
async function buildChatbotEmbed(
  portfolioId: string,
  portfolio: { id: string; chatbotEnabled: boolean }
): Promise<ProfileData["chatbot"] | null> {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "");
  if (!appUrl) return null;
  if (!portfolio.chatbotEnabled) return null;

  // Probe for at least one embedding row. The retrieval corpus lives on
  // the `embeddings` table joined to projects by projectId.
  const projectIds = (
    await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.portfolioId, portfolioId))
  ).map((r) => r.id);

  if (projectIds.length === 0) return null;

  const [any] = await db
    .select({ id: embeddings.id })
    .from(embeddings)
    .where(inArray(embeddings.projectId, projectIds))
    .limit(1);

  if (!any) return null;

  return {
    enabled: true,
    apiEndpoint: `${appUrl}/chatbot-embed.js`,
    portfolioId,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function mapFactCategoryToSkillCategory(
  factCategory: string
): Skill["category"] | null {
  const mapping: Record<string, Skill["category"]> = {
    "tech-stack": "framework",
    technology: "framework",
    language: "language",
    framework: "framework",
    tool: "tool",
    library: "framework",
    concept: "concept",
    pattern: "concept",
    architecture: "concept",
    database: "tool",
    infrastructure: "tool",
    testing: "tool",
    devops: "tool",
  };
  return mapping[factCategory.toLowerCase()] || null;
}

function buildProject(proj: {
  id: string;
  repoUrl: string | null;
  repoName: string | null;
  displayName: string | null;
  displayOrder: number | null;
  isFeatured: boolean | null;
  repoMetadata: unknown;
  // Wave 3B: manual (non-GitHub) project fields
  sourceType?: string | null;
  manualDescription?: string | null;
  externalUrl?: string | null;
  imageUrl?: string | null;
  techStack?: unknown;
  facts: Array<{
    claim: string;
    category: string;
    evidenceRef: string | null;
  }>;
  generatedSections: Array<{
    sectionType: string;
    variant: string;
    content: string;
    isUserEdited: boolean | null;
    userContent: string | null;
    version: number;
  }>;
}): Project {
  const metadata = proj.repoMetadata as Record<string, unknown> | null;
  const isManual = proj.sourceType === "manual";

  // Build sections, preferring user-edited content
  const sections = buildSections(proj.generatedSections);

  // Build facts list
  const projectFacts: ProjectFact[] = proj.facts.map((f) => ({
    claim: f.claim,
    category: f.category,
    evidenceRef: f.evidenceRef || undefined,
  }));

  // For manual projects: user-supplied description replaces AI-generated
  // sections; tech stack comes from the user's techStack JSON column, not
  // from extracted facts/topics (there are none).
  const manualTechStack =
    isManual && Array.isArray(proj.techStack)
      ? (proj.techStack as string[])
      : undefined;
  const techStack =
    manualTechStack ?? extractTechStack(proj.facts, metadata);

  const fallbackDescription = isManual
    ? proj.manualDescription ?? ""
    : (metadata?.description as string) ?? "";

  return {
    id: proj.id,
    name: proj.displayName || proj.repoName || "Untitled Project",
    repoUrl: proj.repoUrl ?? proj.externalUrl ?? "",
    description: sections.summary || fallbackDescription,
    techStack,
    isFeatured: proj.isFeatured ?? false,
    displayOrder: proj.displayOrder ?? 0,
    sections: {
      summary: sections.summary || fallbackDescription,
      architecture: sections.architecture,
      techNarrative: sections["tech-narrative"],
      recruiterPitch: sections["recruiter-pitch"],
      engineerDeepDive: sections["engineer-deep-dive"],
    },
    metadata: {
      stars: (metadata?.stargazers_count as number) ?? undefined,
      forks: (metadata?.forks_count as number) ?? undefined,
      language: (metadata?.language as string) ?? undefined,
      topics: (metadata?.topics as string[]) ?? undefined,
      lastUpdated: (metadata?.updated_at as string) ?? undefined,
      license: extractLicense(metadata),
    },
    facts: projectFacts,
    screenshot: proj.imageUrl ?? undefined,
  };
}

function buildSections(
  sections: Array<{
    sectionType: string;
    variant: string;
    content: string;
    isUserEdited: boolean | null;
    userContent: string | null;
    version: number;
  }>
): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};

  // Group by sectionType, take highest version, prefer userContent
  const grouped = new Map<
    string,
    {
      content: string;
      userContent: string | null;
      isUserEdited: boolean | null;
      version: number;
    }
  >();

  for (const section of sections) {
    const key = section.sectionType;
    const existing = grouped.get(key);
    if (!existing || section.version > existing.version) {
      grouped.set(key, {
        content: section.content,
        userContent: section.userContent,
        isUserEdited: section.isUserEdited,
        version: section.version,
      });
    }
  }

  for (const [key, val] of grouped) {
    // Prefer user-edited content over AI-generated content
    result[key] =
      val.isUserEdited && val.userContent ? val.userContent : val.content;
  }

  return result;
}

function extractTechStack(
  factRows: Array<{ claim: string; category: string }>,
  metadata: Record<string, unknown> | null
): string[] {
  const techSet = new Set<string>();

  // From facts
  for (const fact of factRows) {
    const cat = fact.category.toLowerCase();
    if (
      cat === "tech-stack" ||
      cat === "technology" ||
      cat === "language" ||
      cat === "framework" ||
      cat === "library"
    ) {
      techSet.add(fact.claim);
    }
  }

  // From metadata language
  if (metadata?.language) {
    techSet.add(metadata.language as string);
  }

  // From metadata topics (limited selection)
  if (metadata?.topics && Array.isArray(metadata.topics)) {
    for (const topic of metadata.topics as string[]) {
      techSet.add(topic);
    }
  }

  return Array.from(techSet);
}

function extractLicense(
  metadata: Record<string, unknown> | null
): string | undefined {
  if (!metadata?.license) return undefined;
  if (typeof metadata.license === "string") return metadata.license;
  if (
    typeof metadata.license === "object" &&
    metadata.license !== null &&
    "spdx_id" in metadata.license
  ) {
    return (metadata.license as Record<string, string>).spdx_id;
  }
  return undefined;
}

function buildSocialProfiles(user: {
  githubUsername: string;
  email: string | null;
  resumeJson: unknown;
}): SocialProfile[] {
  const profiles: SocialProfile[] = [];

  // Always add GitHub
  profiles.push({
    network: "GitHub",
    username: user.githubUsername,
    url: `https://github.com/${user.githubUsername}`,
  });

  // Extract from resume if available
  const resume = user.resumeJson as Record<string, unknown> | null;
  if (resume?.basics && typeof resume.basics === "object") {
    const basics = resume.basics as Record<string, unknown>;
    if (basics.profiles && Array.isArray(basics.profiles)) {
      for (const p of basics.profiles as Array<Record<string, string>>) {
        if (p.network && p.url && p.network.toLowerCase() !== "github") {
          profiles.push({
            network: p.network,
            username: p.username || "",
            url: p.url,
          });
        }
      }
    }
    if (basics.url && typeof basics.url === "string") {
      const url = basics.url;
      if (url.includes("linkedin.com")) {
        const hasLinkedin = profiles.some(
          (p) => p.network.toLowerCase() === "linkedin"
        );
        if (!hasLinkedin) {
          profiles.push({
            network: "LinkedIn",
            username: "",
            url,
          });
        }
      }
    }
  }

  return profiles;
}

function extractSummary(
  resumeJson: Record<string, unknown> | null,
  user: { name: string | null; githubUsername: string }
): string {
  if (resumeJson?.basics && typeof resumeJson.basics === "object") {
    const basics = resumeJson.basics as Record<string, unknown>;
    if (basics.summary && typeof basics.summary === "string") {
      return basics.summary;
    }
  }
  const name = user.name || user.githubUsername;
  return `Welcome to ${name}'s portfolio. Explore projects, skills, and experience.`;
}

function extractLabel(
  resumeJson: Record<string, unknown> | null
): string | null {
  if (resumeJson?.basics && typeof resumeJson.basics === "object") {
    const basics = resumeJson.basics as Record<string, unknown>;
    if (basics.label && typeof basics.label === "string") {
      return basics.label;
    }
  }
  return null;
}

function extractExperience(
  resumeJson: Record<string, unknown> | null
): Experience[] {
  if (!resumeJson?.work || !Array.isArray(resumeJson.work)) return [];

  return (resumeJson.work as Array<Record<string, unknown>>).map((w) => ({
    company: (w.name as string) || (w.company as string) || "Unknown",
    position: (w.position as string) || "Unknown",
    startDate: (w.startDate as string) || "",
    endDate: (w.endDate as string) || undefined,
    summary: (w.summary as string) || undefined,
    highlights: Array.isArray(w.highlights)
      ? (w.highlights as string[])
      : undefined,
  }));
}

function extractEducation(
  resumeJson: Record<string, unknown> | null
): Education[] {
  if (!resumeJson?.education || !Array.isArray(resumeJson.education))
    return [];

  return (resumeJson.education as Array<Record<string, unknown>>).map(
    (e) => ({
      institution:
        (e.institution as string) || (e.school as string) || "Unknown",
      area: (e.area as string) || (e.field as string) || "Unknown",
      studyType:
        (e.studyType as string) || (e.degree as string) || "Unknown",
      startDate: (e.startDate as string) || undefined,
      endDate: (e.endDate as string) || undefined,
    })
  );
}
