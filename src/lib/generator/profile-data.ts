import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { portfolios, projects } from "@/lib/db/schema";
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

  // ── Assemble ProfileData ───────────────────────────────────────────────
  const profileData: ProfileData = {
    meta: {
      generatedAt: new Date().toISOString(),
      templateId: portfolio.templateId || "minimal",
      portfolioSlug: portfolio.slug,
      siteUrl: "",
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
  };

  return profileData;
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
  repoUrl: string;
  repoName: string;
  displayName: string | null;
  displayOrder: number | null;
  isFeatured: boolean | null;
  repoMetadata: unknown;
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

  // Build sections, preferring user-edited content
  const sections = buildSections(proj.generatedSections);

  // Build facts list
  const projectFacts: ProjectFact[] = proj.facts.map((f) => ({
    claim: f.claim,
    category: f.category,
    evidenceRef: f.evidenceRef || undefined,
  }));

  // Extract tech stack from metadata or facts
  const techStack = extractTechStack(proj.facts, metadata);

  return {
    id: proj.id,
    name: proj.displayName || proj.repoName,
    repoUrl: proj.repoUrl,
    description:
      sections.summary || (metadata?.description as string) || "",
    techStack,
    isFeatured: proj.isFeatured ?? false,
    displayOrder: proj.displayOrder ?? 0,
    sections: {
      summary:
        sections.summary || (metadata?.description as string) || "",
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
    screenshot: undefined,
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
