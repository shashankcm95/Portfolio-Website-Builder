import { eq, and, inArray, asc, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  deployments,
  domains,
  embeddings,
  portfolios,
  projects,
  testimonials as testimonialsTable,
} from "@/lib/db/schema";
import type {
  ProfileData,
  Project,
  ProjectCredibility,
  ProjectDemo,
  Skill,
  SocialProfile,
  ProjectFact,
  ProjectOutcome,
  Experience,
  Education,
  Testimonial,
} from "@/templates/_shared/types";
import { getAppUrl } from "@/lib/env/app-url";
import {
  storyboardPayloadSchema,
  type StoryboardPayload,
} from "@/lib/ai/schemas/storyboard";
import { isRepoCategory, type RepoCategory } from "@/lib/credibility/types";

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
  // Phase E1 — pull `demos` alongside facts + sections so the published
  // site can render the user-curated demo list. The relation is bounded
  // (MAX_DEMOS_PER_PROJECT = 8 in src/lib/demos/types.ts), so loading
  // them inline doesn't blow up the query.
  const projectRows = await db.query.projects.findMany({
    where: and(
      eq(projects.portfolioId, portfolioId),
      eq(projects.isVisible, true)
    ),
    orderBy: [projects.displayOrder],
    with: {
      facts: true,
      generatedSections: true,
      demos: {
        orderBy: (d, { asc }) => [asc(d.order)],
      },
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

  // ── Phase A: testimonials ──────────────────────────────────────────────
  // Visible only. Ordered by displayOrder. Empty ⇒ omit the field entirely
  // so templates can gate whole sections on its presence.
  const testimonialRows = await db.query.testimonials.findMany({
    where: and(
      eq(testimonialsTable.portfolioId, portfolioId),
      eq(testimonialsTable.isVisible, true)
    ),
    orderBy: [asc(testimonialsTable.displayOrder)],
  });
  const testimonialsList: Testimonial[] = testimonialRows.map((t) => ({
    quote: t.quote,
    authorName: t.authorName,
    authorTitle: t.authorTitle ?? undefined,
    authorCompany: t.authorCompany ?? undefined,
    authorUrl: t.authorUrl ?? undefined,
    avatarUrl: t.avatarUrl ?? undefined,
  }));

  // ── Phase A: hero extensions ───────────────────────────────────────────
  // positioning, namedEmployers, hiring, anchorStat — all optional. New
  // templates read these; old templates ignore them and render exactly as
  // before (keeps the backwards-compatibility guarantee).
  const namedEmployers = readNamedEmployers(portfolio.namedEmployers);
  const hiring = readHiring(
    portfolio.hireStatus,
    portfolio.hireCtaText,
    portfolio.hireCtaHref
  );
  // Phase B — deterministic anchor selection. User override wins; when
  // absent, `deriveAnchorStat` ranks verified candidates from project
  // metadata, outcomes, and resume employers and picks the strongest.
  const anchorStat =
    readAnchorStat(portfolio.anchorStatOverride) ??
    deriveAnchorStat(projectList, namedEmployers, resumeJson);

  // Phase B — skills filtered to those with at least one piece of
  // evidence. The "skills as logo grid" anti-pattern surfaces every
  // extracted topic; now we only surface skills backed by a project
  // (and sort by evidence count so the most-used land first).
  const allSkills = Array.from(skillsMap.values());
  const evidencedSkills = filterEvidencedSkills(allSkills);

  // ── Resolve the public site URL for canonical / og:url / sitemap ──────
  // Priority:
  //   1. The first verified custom domain → `https://${domain}`
  //      Cloudflare Pages auto-provisions Let's Encrypt for attached
  //      custom domains, so HTTPS is the right scheme regardless of
  //      what the registrar has historically served. HSTS-preloaded
  //      TLDs (.dev / .app / etc.) require it; legacy TLDs benefit
  //      from canonical-https for SEO.
  //   2. Latest successful Cloudflare Pages deployment URL — already
  //      `https://…pages.dev`.
  //   3. Empty string — preserves the previous behavior so templates
  //      that gate canonical-link emission on truthy siteUrl don't
  //      break for portfolios that haven't deployed yet.
  const siteUrl = await resolveSiteUrl(portfolioId);

  // ── Assemble ProfileData ───────────────────────────────────────────────
  const profileData: ProfileData = {
    meta: {
      generatedAt: new Date().toISOString(),
      templateId: portfolio.templateId || "minimal",
      portfolioSlug: portfolio.slug,
      siteUrl,
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
      positioning: portfolio.positioning ?? undefined,
      namedEmployers: namedEmployers.length > 0 ? namedEmployers : undefined,
      hiring,
      anchorStat,
    },
    skills: evidencedSkills,
    projects: projectList,
    experience: experience.length > 0 ? experience : undefined,
    education: education.length > 0 ? education : undefined,
    testimonials:
      testimonialsList.length > 0 ? testimonialsList : undefined,
    chatbot: chatbotEmbed ?? undefined,
  };

  return profileData;
}

/**
 * Phase A — read `portfolios.named_employers` jsonb, tolerating malformed
 * stored data. Returns [] for null/non-array/non-string items.
 */
function readNamedEmployers(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (x): x is string => typeof x === "string" && x.trim().length > 0
  );
}

/**
 * Phase A — build the `basics.hiring` object from the three portfolio
 * columns. "not-looking" (default for existing rows) returns undefined so
 * old portfolios render no CTA. Missing CTA text/href is fine — templates
 * carry sensible fallback copy and can route to the contact page.
 */
function readHiring(
  status: string | null,
  ctaText: string | null,
  ctaHref: string | null
): ProfileData["basics"]["hiring"] {
  const s = (status ?? "not-looking").trim();
  if (s !== "available" && s !== "open" && s !== "not-looking") {
    return undefined;
  }
  if (s === "not-looking") return undefined;
  return {
    status: s,
    ctaText: ctaText ?? undefined,
    ctaHref: ctaHref ?? undefined,
  };
}

/**
 * Phase A — read the `anchor_stat_override` jsonb. Returns undefined when
 * the override is absent or malformed. Phase B will layer a pipeline-
 * computed default underneath this (currently: no default — undefined ⇒
 * templates skip the anchor pill).
 */
function readAnchorStat(
  raw: unknown
): ProfileData["basics"]["anchorStat"] {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const value = typeof o.value === "string" ? o.value.trim() : "";
  const unit = typeof o.unit === "string" ? o.unit.trim() : "";
  if (!value || !unit) return undefined;
  return {
    value,
    unit,
    context:
      typeof o.context === "string" && o.context.trim().length > 0
        ? o.context.trim()
        : undefined,
    sourceRef:
      typeof o.sourceRef === "string" && o.sourceRef.trim().length > 0
        ? o.sourceRef.trim()
        : undefined,
  };
}

/**
 * Phase 6 — Build the dynamic OG image URL that the published site's
 * meta tags point at. Returns null when NEXT_PUBLIC_APP_URL isn't set
 * (template falls back to `basics.avatar`). The `v` cache-buster
 * encodes `portfolio.updatedAt` so social scrapers fetch a fresh image
 * after meaningful edits.
 */
/**
 * Phase 8.5 — Point the generated site's `og:image` at a relative path
 * (`/og.png`) that's baked into the deploy by `renderTemplate`. Social
 * scrapers resolve it against the portfolio's own origin and never call
 * back to the builder. Returns a fixed string for backward-compat; args
 * are retained so the signature doesn't break existing callers but
 * are unused.
 *
 * The file itself is emitted only if `bakePortfolioOgImage` succeeds. If
 * it doesn't, the file map is missing `og.png` and a visitor's scraper
 * gets a 404 for the image — template falls through to `basics.avatar`
 * via the existing `meta.ogImageUrl || basics.avatar` pattern.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
/**
 * Phase R7 — Resolve the public site URL for the published portfolio.
 *
 * Used as the canonical link, og:url, and sitemap base. Returns "" when
 * the portfolio has neither a verified custom domain nor a successful
 * deploy — templates already gate emission on truthy siteUrl, so a
 * never-deployed portfolio renders sane partial meta tags.
 *
 * The protocol is always `https://`. Cloudflare Pages auto-provisions
 * Let's Encrypt certs for both `*.pages.dev` and attached custom
 * domains, so we never need to emit an `http://` canonical URL.
 * HSTS-preloaded TLDs (`.dev`, `.app`, `.bank`, etc.) reject HTTP
 * unconditionally — emitting `https://` here is what they expect.
 */
async function resolveSiteUrl(portfolioId: string): Promise<string> {
  // 1. Verified custom domain wins — owner explicitly set this up and
  //    stored it through the domain-attach flow. Most-recently-verified
  //    first if multiple exist (rare, but possible during a transition).
  const [verifiedDomain] = await db
    .select({ domain: domains.domain })
    .from(domains)
    .where(
      and(
        eq(domains.portfolioId, portfolioId),
        eq(domains.verificationStatus, "verified")
      )
    )
    .orderBy(desc(domains.verifiedAt))
    .limit(1);
  if (verifiedDomain?.domain) {
    return `https://${verifiedDomain.domain}`;
  }

  // 2. Fall back to the latest successful Pages deployment. Its `url`
  //    is already `https://…pages.dev` from Cloudflare's response.
  const [latestDeployment] = await db
    .select({ url: deployments.url })
    .from(deployments)
    .where(
      and(
        eq(deployments.portfolioId, portfolioId),
        eq(deployments.status, "active")
      )
    )
    .orderBy(desc(deployments.deployedAt))
    .limit(1);
  if (latestDeployment?.url) {
    return latestDeployment.url.replace(/\/+$/, "");
  }

  return "";
}

function buildOgImageUrl(
  _portfolioId: string,
  _updatedAt: Date | null | undefined
): string | null {
  return "/og.png";
}

/**
 * Phase 6 — Analytics beacon endpoint + portfolio id. Both null when
 * NEXT_PUBLIC_APP_URL isn't set OR is a private/localhost host (the
 * generated site can't reach it from a visitor's browser).
 */
function buildAnalyticsConfig(portfolioId: string): {
  analyticsEndpoint: string | null;
  analyticsPortfolioId: string | null;
} {
  const appUrl = getAppUrl();
  if (!appUrl || isPrivateOrigin(appUrl)) {
    return { analyticsEndpoint: null, analyticsPortfolioId: null };
  }
  return {
    analyticsEndpoint: `${appUrl}/api/events/track`,
    analyticsPortfolioId: portfolioId,
  };
}

/**
 * Phase R7 — Detect URLs that aren't reachable from a deployed visitor.
 * Returns true for localhost, loopback IPs, private RFC1918 ranges, and
 * `*.local` mDNS hosts. Used as a publish-time guard so we don't bake
 * a dev value into a live site. Tolerant of malformed input (returns
 * false rather than throwing) — caller already handles the empty case.
 */
function isPrivateOrigin(rawUrl: string): boolean {
  let host: string;
  try {
    host = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host === "localhost" || host === "0.0.0.0") return true;
  if (host.endsWith(".local") || host.endsWith(".localhost")) return true;
  // IPv4 ranges
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  // IPv6 loopback
  if (host === "::1" || host === "[::1]") return true;
  return false;
}

/**
 * Resolve the ProfileData.chatbot block if (and only if) the gates pass.
 * Returns null when any gate fails — template then omits the script.
 *
 * Three shapes:
 *   1. `selfHosted: true` (Phase 9) — iframe hits `/chat.html` on the
 *      published site. Requires at least one embedding row; does NOT
 *      require `NEXT_PUBLIC_APP_URL` (published site is fully
 *      standalone). The renderer will bake the Pages Function bundle.
 *   2. `selfHosted: false` + `appOrigin` set (Phase 8.5 default) —
 *      iframe hits the builder's `/embed/chatbot/:pid`. Requires
 *      `NEXT_PUBLIC_APP_URL`.
 *   3. null — chatbot disabled / no embeddings / builder URL missing.
 */
async function buildChatbotEmbed(
  portfolioId: string,
  portfolio: {
    id: string;
    chatbotEnabled: boolean;
    selfHostedChatbot?: boolean | null;
  }
): Promise<ProfileData["chatbot"] | null> {
  if (!portfolio.chatbotEnabled) return null;

  const appUrl = getAppUrl();
  const selfHosted = portfolio.selfHostedChatbot === true;

  // Self-hosted path skips the NEXT_PUBLIC_APP_URL gate — the published
  // site doesn't need to know the builder's URL. Cross-origin path
  // keeps the gate.
  if (!selfHosted && !appUrl) return null;

  // Phase R7 — refuse to bake a non-public appOrigin into the published
  // HTML. When NEXT_PUBLIC_APP_URL is set to localhost / 127.0.0.1 / a
  // private LAN address (the dev default), the iframe load fails for
  // every visitor of the live site because the URL only resolves on
  // the operator's laptop. Drop the chatbot block in this case so the
  // template renders without a broken iframe rather than producing a
  // dead one. Self-hosted deploys are unaffected (they use /chat.html
  // on the same origin and never see appOrigin).
  if (!selfHosted && appUrl && isPrivateOrigin(appUrl)) {
    console.warn(
      `[profile-data] Skipping chatbot embed for portfolio ${portfolioId}: ` +
        `NEXT_PUBLIC_APP_URL is "${appUrl}", which isn't reachable from a ` +
        "deployed site. Either set a public URL or enable selfHostedChatbot."
    );
    return null;
  }

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
    // Phase 8.5 — kept for back-compat; new Layout.tsx uses `appOrigin`
    // with an inline snippet instead of `<script src={apiEndpoint}>`.
    apiEndpoint: appUrl ? `${appUrl}/chatbot-embed.js` : "",
    // Phase R5 — `appUrl` is string|null now. The self-hosted branch
    // skips the NEXT_PUBLIC_APP_URL gate (line 365) so null can reach
    // here; fall through to "" to match the pre-R5 string contract.
    appOrigin: appUrl ?? "",
    portfolioId,
    selfHosted,
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
  // Phase 8 — coaching fields. When
  // `showCharacterizationOnPortfolio === true`, we read the pre-generated
  // characterization out of the stored `credibilitySignals.authorshipSignal
  // .presentation.characterization` and bake it into the Project shape so
  // the template can render it as a muted byline. Omitting = no byline.
  credibilitySignals?: unknown;
  showCharacterizationOnPortfolio?: boolean | null;
  // Phase 8 — repo classification (oss_author / personal_tool / etc.).
  projectCategory?: string | null;
  // Phase A — user-editable outcomes seeded from Phase B's fact-extract.
  outcomes?: unknown;
  facts: Array<{
    claim: string;
    category: string;
    evidenceRef: string | null;
    // Phase E1 — additional evidence fields the published site can surface.
    evidenceType?: string | null;
    evidenceText?: string | null;
    confidence?: number | null;
    isVerified?: boolean | null;
  }>;
  generatedSections: Array<{
    sectionType: string;
    variant: string;
    content: string;
    isUserEdited: boolean | null;
    userContent: string | null;
    version: number;
  }>;
  // Phase E1 — demo rows pulled via the new `demos` relation. Already
  // ordered by `order` ascending.
  demos?: Array<{
    id: string;
    url: string;
    type: string;
    title: string | null;
    order: number;
    thumbnailUrl?: string | null;
    oembedTitle?: string | null;
    oembedFetchedAt?: Date | null;
  }>;
}): Project {
  const metadata = proj.repoMetadata as Record<string, unknown> | null;
  const isManual = proj.sourceType === "manual";

  // Build sections, preferring user-edited content. Phase E4 — keep
  // both `recruiter` and `engineer` variants separately so the templates
  // can render a view toggle.
  const { recruiter: sections, engineer: engineerSections } =
    buildSections(proj.generatedSections);

  // Build facts list
  // Phase E1 — preserve the full evidence trail (`evidenceType`,
  // `evidenceText`, `confidence`, `isVerified`) so templates can render
  // citations, source quotes, and verification ticks. Pre-E1 templates
  // ignore the new fields and continue rendering just the claim text.
  const projectFacts: ProjectFact[] = proj.facts.map((f) => ({
    claim: f.claim,
    category: f.category,
    evidenceRef: f.evidenceRef || undefined,
    evidenceType:
      typeof f.evidenceType === "string" && f.evidenceType.length > 0
        ? f.evidenceType
        : undefined,
    evidenceText:
      typeof f.evidenceText === "string" && f.evidenceText.length > 0
        ? f.evidenceText
        : undefined,
    confidence:
      typeof f.confidence === "number" && Number.isFinite(f.confidence)
        ? f.confidence
        : undefined,
    isVerified:
      typeof f.isVerified === "boolean" ? f.isVerified : undefined,
  }));

  // Phase E1 — load the verified storyboard payload (6-card guided tour)
  // when the storyboard step has produced one. User-edited content wins
  // over LLM-emitted content; malformed JSON fails closed (undefined).
  const storyboard = readStoryboardFromSections(proj.generatedSections);

  // Phase E1 — distil the credibility signals + repo category into a
  // template-friendly shape. Every field is optional; the block is
  // omitted entirely when nothing useful was distilled.
  const credibility = readCredibility(
    proj.credibilitySignals,
    proj.projectCategory ?? null
  );

  // Phase E1 — pass user-curated demos through. We intentionally don't
  // resolve them to embed URLs here — that's a render-time concern that
  // belongs in the shared `<ProjectDemoCarousel>` component (Phase E2).
  const demos = readDemos(proj.demos);

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
      // Phase E4 — fix pre-existing key-style bug. The pipeline persists
      // these section types in snake_case (`tech_narrative`,
      // `recruiter_pitch`, `engineer_deep_dive`) per the
      // `sectionTypeEnum` contract in src/lib/ai/schemas/narrative.ts.
      // Pre-E4 this code read the dash-cased keys and silently dropped
      // every techNarrative / recruiterPitch / engineerDeepDive section
      // from every published portfolio. `buildSections` now normalises
      // to camelCase keys so all five sections actually render.
      techNarrative: sections.techNarrative,
      recruiterPitch: sections.recruiterPitch,
      engineerDeepDive: sections.engineerDeepDive,
    },
    engineerSections: hasAnyEngineerSection(engineerSections)
      ? {
          summary: engineerSections.summary,
          architecture: engineerSections.architecture,
          techNarrative: engineerSections.techNarrative,
          recruiterPitch: engineerSections.recruiterPitch,
          engineerDeepDive: engineerSections.engineerDeepDive,
        }
      : undefined,
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
    // Phase 8 — opt-in characterization byline. Only populated when the
    // owner has flipped `showCharacterizationOnPortfolio` to true and a
    // characterization string is present in the stored credibility bundle.
    // The value is a plain string baked into the generated HTML — no
    // runtime dependency on the builder.
    characterization: readCharacterization(
      proj.showCharacterizationOnPortfolio ?? false,
      proj.credibilitySignals
    ),
    // Phase A — quantified outcomes. Empty ⇒ templates render no outcomes
    // block (graceful degradation for existing projects that predate the
    // fact-extraction update).
    outcomes: readOutcomes(proj.outcomes),
    // Phase E1 — guided-tour payload, distilled credibility, and user
    // demos. All optional; templates that haven't been wired to them
    // ignore the fields and render exactly as before.
    storyboard,
    demos,
    credibility,
  };
}

/**
 * Phase B — deterministic anchor-stat selection.
 *
 * Ranks every verifiable candidate from the already-assembled ProfileData
 * against a fixed rubric and returns the single strongest. Candidates come
 * from three sources:
 *   1. Project outcomes (numeric value × parsed magnitude)
 *   2. Project GitHub metadata (stars, forks)
 *   3. Resume work history + user-supplied named employers (presence, not count)
 *
 * No LLM involvement — keeps the step deterministic, test-free, and
 * rebuildable without a provider key. An optional LLM tie-break for
 * phrasing was considered but shelved: the candidates already carry their
 * own display copy (value + unit), so there's nothing meaningful for an
 * LLM to improve. The `anchorStatOverride` column (set via the Phase C
 * editor) still lets users pick a different candidate manually.
 */
export function deriveAnchorStat(
  projectList: Project[],
  namedEmployers: string[],
  resumeJson: Record<string, unknown> | null
): ProfileData["basics"]["anchorStat"] {
  type Candidate = {
    value: string;
    unit: string;
    context?: string;
    sourceRef?: string;
    score: number;
  };
  const candidates: Candidate[] = [];

  for (const p of projectList) {
    // Outcome pills already carry an explicit value + unit — highest-signal.
    // Score = magnitude of the parsed numeric (roughly). "10M" beats "100".
    if (p.outcomes && p.outcomes.length > 0) {
      for (const o of p.outcomes) {
        const magnitude = parseMagnitude(o.value);
        candidates.push({
          value: o.value,
          unit: o.metric,
          context: o.context ?? `on ${p.name}`,
          sourceRef: o.evidenceRef ?? p.repoUrl,
          score: 1000 + magnitude, // outcomes always outrank raw metadata
        });
      }
    }

    // GitHub stars / forks are verifiable from the API. Stars ≥ 10 is the
    // classifier's OSS-author floor (src/lib/credibility/category.ts).
    const stars = p.metadata.stars ?? 0;
    if (stars >= 10) {
      candidates.push({
        value: formatCount(stars),
        unit: "GitHub stars",
        context: `on ${p.name}`,
        sourceRef: p.repoUrl,
        score: Math.min(900, 500 + stars), // caps under outcome tier
      });
    }
  }

  // Resume / user-supplied employer anchor — "Previously at Apple, Klaviyo".
  // Scored below numeric signals but above nothing. Phase A populated
  // `namedEmployers` from the portfolios column; we also mine resume work
  // history when the user hasn't curated a list yet.
  const employerSources =
    namedEmployers.length > 0
      ? namedEmployers
      : extractEmployerNames(resumeJson);
  if (employerSources.length > 0) {
    const top = employerSources.slice(0, 3).join(", ");
    candidates.push({
      value: "Previously at",
      unit: top,
      score: 200 + Math.min(50, employerSources.length * 10),
    });
  }

  if (candidates.length === 0) return undefined;

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates[0];
  return {
    value: top.value,
    unit: top.unit,
    context: top.context,
    sourceRef: top.sourceRef,
  };
}

/**
 * Phase B — very rough magnitude parser used only for ranking outcome
 * candidates ("10M" > "5k" > "80"). Not a general number parser. Returns
 * 0 when no digits found so unparseable values don't crash the rank.
 */
export function parseMagnitude(raw: string): number {
  const match = raw.match(/([\d.]+)\s*([kKmMbB]?)/);
  if (!match) return 0;
  const n = parseFloat(match[1]);
  if (!isFinite(n)) return 0;
  const suffix = match[2]?.toLowerCase();
  switch (suffix) {
    case "b":
      return n * 1e9;
    case "m":
      return n * 1e6;
    case "k":
      return n * 1e3;
    default:
      return n;
  }
}

export function formatCount(n: number): string {
  if (n >= 1000) return `${Math.floor(n / 100) / 10}k+`.replace(/\.0k/, "k");
  return `${n}+`;
}

export function extractEmployerNames(
  resumeJson: Record<string, unknown> | null
): string[] {
  if (!resumeJson || !Array.isArray(resumeJson.work)) return [];
  const names = new Set<string>();
  for (const w of resumeJson.work as Array<Record<string, unknown>>) {
    const name =
      (typeof w.name === "string" && w.name) ||
      (typeof w.company === "string" && w.company);
    if (name && typeof name === "string") names.add(name);
  }
  return Array.from(names);
}

/**
 * Phase B — filter skills to those with real evidence, sorted by evidence
 * count (most-used first). The existing assembly already attaches
 * `evidence[]` when a skill is extracted from a project fact or topic;
 * this just drops entries that slipped through with an empty list and
 * orders the survivors.
 */
export function filterEvidencedSkills(skills: Skill[]): Skill[] {
  return skills
    .filter((s) => Array.isArray(s.evidence) && s.evidence.length > 0)
    .sort(
      (a, b) =>
        (b.evidence?.length ?? 0) - (a.evidence?.length ?? 0) ||
        a.name.localeCompare(b.name)
    );
}

/**
 * Phase A — read `projects.outcomes` jsonb. Drops malformed entries. Each
 * valid entry needs a `metric` and a `value`; `context` and `evidenceRef`
 * are optional phrasing/traceability fields.
 */
function readOutcomes(raw: unknown): ProjectOutcome[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const list: ProjectOutcome[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const o = entry as Record<string, unknown>;
    const metric = typeof o.metric === "string" ? o.metric.trim() : "";
    const value = typeof o.value === "string" ? o.value.trim() : "";
    if (!metric || !value) continue;
    list.push({
      metric,
      value,
      context:
        typeof o.context === "string" && o.context.trim().length > 0
          ? o.context.trim()
          : undefined,
      evidenceRef:
        typeof o.evidenceRef === "string" && o.evidenceRef.trim().length > 0
          ? o.evidenceRef.trim()
          : undefined,
    });
  }
  return list.length > 0 ? list : undefined;
}

/**
 * Phase E1 — pull the 6-card storyboard payload out of the
 * `generated_sections` rows already loaded for this project.
 *
 * The pipeline persists each generated storyboard with
 * `sectionType="storyboard"` and `variant="default"`, JSON-stringified into
 * `content`. We pick the highest-version row, prefer user-edited content
 * when present, and parse via the canonical zod schema. Any failure (no
 * row, malformed JSON, schema drift) returns undefined so the published
 * site simply skips the storyboard block — never crashes the publish.
 */
export function readStoryboardFromSections(
  sections: Array<{
    sectionType: string;
    variant: string;
    content: string;
    isUserEdited: boolean | null;
    userContent: string | null;
    version: number;
  }>
): StoryboardPayload | undefined {
  let best:
    | {
        content: string;
        userContent: string | null;
        isUserEdited: boolean | null;
        version: number;
      }
    | undefined;
  for (const s of sections) {
    if (s.sectionType !== "storyboard") continue;
    if (s.variant !== "default") continue;
    if (!best || s.version > best.version) {
      best = s;
    }
  }
  if (!best) return undefined;

  const raw = best.isUserEdited && best.userContent ? best.userContent : best.content;
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const result = storyboardPayloadSchema.safeParse(parsedJson);
  return result.success ? result.data : undefined;
}

/**
 * Phase E1 — convert the loaded `project_demos` rows into the
 * publish-time `ProjectDemo[]` shape templates consume.
 *
 * - Empty / missing input returns `undefined` so templates can branch on
 *   presence without checking for empty arrays.
 * - `oembedFetchedAt` is a `Date` in DB-land but `string | null` on the
 *   wire; we serialize to ISO so the published site (static HTML, no DB)
 *   sees a stable shape. The current renderer doesn't read this field
 *   visibly but downstream features (cache-busting, freshness badges)
 *   will, and shipping the conversion now avoids a future migration.
 * - `type` is text in the DB; we cast through `string` here. The render
 *   layer is what enforces "is this an embeddable kind?" via
 *   `src/lib/demos/render-mode.ts`.
 */
export function readDemos(
  rows:
    | Array<{
        id: string;
        url: string;
        type: string;
        title: string | null;
        order: number;
        thumbnailUrl?: string | null;
        oembedTitle?: string | null;
        oembedFetchedAt?: Date | null;
      }>
    | undefined
): ProjectDemo[] | undefined {
  if (!rows || rows.length === 0) return undefined;
  return rows.map((r) => ({
    id: r.id,
    url: r.url,
    type: r.type as ProjectDemo["type"],
    title: r.title,
    order: r.order,
    thumbnailUrl: r.thumbnailUrl ?? null,
    oembedTitle: r.oembedTitle ?? null,
    oembedFetchedAt: r.oembedFetchedAt ? r.oembedFetchedAt.toISOString() : null,
  }));
}

/**
 * Phase E1 — distil the rich `credibility_signals` jsonb into the small
 * template-facing shape (`ProjectCredibility`).
 *
 * The full bundle (Phase 1 / Phase 8) is huge — workflows, contributor
 * lists, language histograms, commit activity windows — and templates
 * should not be reaching into untyped jsonb. This function picks the
 * three or four signals worth surfacing publicly and ignores the rest.
 *
 * Returns `undefined` when there's nothing meaningful to render so
 * templates can omit the entire credibility block.
 */
export function readCredibility(
  signals: unknown,
  projectCategoryRaw: string | null
): ProjectCredibility | undefined {
  const out: ProjectCredibility = {};

  // 1. Repo category (Phase 8) — comes from a separate column, not the
  //    signals jsonb. Validate against the enum so a malformed string
  //    can't land in the published HTML.
  if (projectCategoryRaw && isRepoCategory(projectCategoryRaw)) {
    out.category = projectCategoryRaw as RepoCategory;
  }

  if (signals && typeof signals === "object") {
    const root = signals as Record<string, unknown>;

    // 2. Authorship status — boolean-ish summary of "did the scorer
    //    succeed?". Doesn't carry the verdict, just whether we can
    //    trust the rest of the signals.
    const authorship = root.authorshipSignal as
      | { status?: unknown }
      | undefined;
    if (authorship && typeof authorship === "object") {
      if (authorship.status === "ok") out.authorshipStatus = "ok";
      else if (authorship.status === "missing") out.authorshipStatus = "missing";
    }

    // 3. Contributor count — Phase 1 fetcher writes this as
    //    `contributors.count`. The full contributor array is not surfaced.
    const contributors = root.contributors as
      | { count?: unknown; status?: unknown }
      | undefined;
    if (
      contributors &&
      typeof contributors === "object" &&
      contributors.status === "ok" &&
      typeof contributors.count === "number" &&
      contributors.count >= 0
    ) {
      out.contributorCount = contributors.count;
    }

    // 4. Booleans for the "does it ship like a real project?" badge row.
    out.hasCi = pickHasFlag(root.workflows);
    out.hasReleases = pickHasFlag(root.releases);
    out.hasTests = pickHasFlag(root.testFramework);

    // 5. Public deploy URL — null/undefined when the repo has neither a
    //    `homepage` nor a known deploy host. Surfaces as a "Live →" link.
    if (typeof root.externalUrl === "string" && root.externalUrl.length > 0) {
      out.externalUrl = root.externalUrl;
    } else if (root.externalUrl === null) {
      out.externalUrl = null;
    }
  }

  // Drop the block entirely when no field carried information. Templates
  // gate the credibility row on `credibility !== undefined` and skip
  // cleanly when nothing was distilled.
  const meaningful =
    out.category !== undefined ||
    out.authorshipStatus !== undefined ||
    out.contributorCount !== undefined ||
    out.hasCi === true ||
    out.hasReleases === true ||
    out.hasTests === true ||
    (typeof out.externalUrl === "string" && out.externalUrl.length > 0);
  return meaningful ? out : undefined;
}

/**
 * Helper for `readCredibility` — credibility signal shapes vary by
 * category but most carry a `status: "ok" | "error" | "missing"` field
 * plus a populated array (workflows[], releases[], etc.). Returning
 * `true` when the signal scored cleanly AND has at least one entry
 * keeps the badge row honest — we don't claim "has CI" for repos
 * whose workflow scan failed.
 */
function pickHasFlag(signal: unknown): boolean | undefined {
  if (!signal || typeof signal !== "object") return undefined;
  const s = signal as Record<string, unknown>;
  if (s.status !== "ok") return undefined;
  // Common shape: an array of items lives next to status.
  for (const key of [
    "workflows",
    "releases",
    "frameworks",
    "items",
    "categories",
  ]) {
    const arr = s[key];
    if (Array.isArray(arr)) return arr.length > 0;
  }
  // Fallback: numeric `count` field used by some sub-signals.
  if (typeof s.count === "number") return s.count > 0;
  // Status was OK but the shape doesn't match anything we know — be
  // conservative and stay silent.
  return undefined;
}

/**
 * Phase 8 helper — safely read
 * `credibilitySignals.authorshipSignal.presentation.characterization` out of
 * the untyped jsonb column. Returns undefined when the toggle is off, the
 * signal is missing, or the shape doesn't match. Never throws; the
 * published site must render even with malformed stored data.
 */
function readCharacterization(
  enabled: boolean,
  signals: unknown
): string | undefined {
  if (!enabled) return undefined;
  if (!signals || typeof signals !== "object") return undefined;
  const authorship = (signals as Record<string, unknown>).authorshipSignal;
  if (
    !authorship ||
    typeof authorship !== "object" ||
    (authorship as Record<string, unknown>).status !== "ok"
  ) {
    return undefined;
  }
  const presentation = (authorship as Record<string, unknown>).presentation;
  if (!presentation || typeof presentation !== "object") return undefined;
  const line = (presentation as Record<string, unknown>).characterization;
  return typeof line === "string" && line.trim().length > 0
    ? line.trim()
    : undefined;
}

/**
 * Phase E4 — sectionType key normalization. The pipeline persists section
 * types in snake_case (`tech_narrative`, `recruiter_pitch`,
 * `engineer_deep_dive`) per `sectionTypeEnum` in
 * src/lib/ai/schemas/narrative.ts. The Project type templates consume
 * uses camelCase. Pre-E4 the publisher used dash-case here, which
 * silently dropped three of the five sections from every portfolio.
 *
 * Storyboard rows also live in `generated_sections` but go through their
 * own loader (`readStoryboardFromSections`) — we ignore the
 * `"storyboard"` sectionType here.
 */
const SECTION_TYPE_TO_CAMEL: Record<string, string> = {
  summary: "summary",
  architecture: "architecture",
  tech_narrative: "techNarrative",
  recruiter_pitch: "recruiterPitch",
  engineer_deep_dive: "engineerDeepDive",
};

interface BuiltSections {
  recruiter: Record<string, string | undefined>;
  engineer: Record<string, string | undefined>;
}

/**
 * Build the recruiter + engineer narrative section maps from the
 * already-loaded `generated_sections` rows for a project.
 *
 * Per (sectionType × variant) pair we keep the highest-version row, and
 * within that row prefer user-edited content. Returns two parallel maps
 * keyed by camelCased section type. Both maps may have a sparse subset
 * of keys — early projects only had recruiter variants, and a fresh
 * pipeline run might fail on a single section without taking the rest
 * down with it.
 */
function buildSections(
  sections: Array<{
    sectionType: string;
    variant: string;
    content: string;
    isUserEdited: boolean | null;
    userContent: string | null;
    version: number;
  }>
): BuiltSections {
  type Cell = {
    content: string;
    userContent: string | null;
    isUserEdited: boolean | null;
    version: number;
  };
  // Compound key: `${variant}|${sectionType}` so we keep both variants.
  const grouped = new Map<string, Cell>();

  for (const section of sections) {
    if (section.sectionType === "storyboard") continue;
    const camelKey = SECTION_TYPE_TO_CAMEL[section.sectionType];
    if (!camelKey) continue; // unknown section type — leave for forward-compat
    // Variants other than "recruiter" / "engineer" are out-of-contract.
    if (section.variant !== "recruiter" && section.variant !== "engineer") {
      continue;
    }
    const compound = `${section.variant}|${camelKey}`;
    const existing = grouped.get(compound);
    if (!existing || section.version > existing.version) {
      grouped.set(compound, {
        content: section.content,
        userContent: section.userContent,
        isUserEdited: section.isUserEdited,
        version: section.version,
      });
    }
  }

  const recruiter: Record<string, string | undefined> = {};
  const engineer: Record<string, string | undefined> = {};
  for (const [compound, val] of grouped) {
    const [variant, camelKey] = compound.split("|");
    const text =
      val.isUserEdited && val.userContent ? val.userContent : val.content;
    if (variant === "recruiter") recruiter[camelKey] = text;
    else if (variant === "engineer") engineer[camelKey] = text;
  }

  return { recruiter, engineer };
}

/**
 * Returns true when at least one engineer-variant section is populated.
 * Used to gate `Project.engineerSections` so templates can branch on
 * presence without checking every key.
 */
function hasAnyEngineerSection(
  engineer: Record<string, string | undefined>
): boolean {
  return Object.values(engineer).some(
    (v) => typeof v === "string" && v.length > 0
  );
}

function extractTechStack(
  factRows: Array<{ claim: string; category: string }>,
  metadata: Record<string, unknown> | null
): string[] {
  // Phase R7 — case-insensitive dedupe. Set<string> alone treats
  // "TypeScript" (from metadata.language) and "typescript" (from
  // metadata.topics) as different entries, so the rendered project
  // card shows duplicates like "TypeScript · TypeScript". We collect
  // candidates into a Map keyed by lowercased value, preferring the
  // first capitalization we see (which is metadata.language for
  // GitHub repos — already in the canonical form).
  const seen = new Map<string, string>();
  const add = (value: unknown) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) seen.set(key, trimmed);
  };

  // From metadata language first — GitHub returns canonical
  // capitalization ("TypeScript", "Python") which we want to win.
  if (metadata?.language) add(metadata.language);

  // From facts
  for (const fact of factRows) {
    const cat = fact.category.toLowerCase();
    if (
      cat === "tech-stack" ||
      cat === "tech_stack" ||
      cat === "technology" ||
      cat === "language" ||
      cat === "framework" ||
      cat === "library"
    ) {
      add(fact.claim);
    }
  }

  // From metadata topics (lowercase by GitHub convention; lose the
  // race to language above so capitalization is preserved).
  if (metadata?.topics && Array.isArray(metadata.topics)) {
    for (const topic of metadata.topics as unknown[]) {
      add(topic);
    }
  }

  return Array.from(seen.values());
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

/**
 * Phase R7 — Resume URLs are user-typed and routinely missing a
 * protocol (e.g. `linkedin.com/in/jane`, `github.com/jane`,
 * `www.example.com`). Without a leading scheme, browsers treat the
 * value as a relative path inside the rendered page, sending visitors
 * to `https://jane.dev/linkedin.com/in/jane` (a 404). Normalize to
 * `https://` whenever the input is missing a scheme; preserve `mailto:`
 * and explicit `http://` (so locally-hosted dev links don't get
 * upgraded silently).
 */
function normalizeProfileUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  // Already has a scheme — leave it as-is.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, "")}`;
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
            url: normalizeProfileUrl(p.url),
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
            url: normalizeProfileUrl(url),
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
