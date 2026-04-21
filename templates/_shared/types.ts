/**
 * ProfileData Contract
 *
 * This is the single most important type in the system.
 * It is the interface between the intelligence pipeline, the database, and every template.
 * Templates receive this as their sole data input.
 */

export interface ProfileData {
  meta: {
    generatedAt: string;
    templateId: string;
    portfolioSlug: string;
    siteUrl: string;
    /**
     * Phase 6 — absolute URL to the dynamic OG image for this
     * portfolio, e.g. `{APP_URL}/api/og?portfolioId=X&v=<hash>`.
     * Null when NEXT_PUBLIC_APP_URL isn't configured at build time;
     * Layout.tsx falls back to the owner's avatar for og:image in that
     * case (matches the Phase-4 behavior).
     */
    ogImageUrl?: string | null;
    /**
     * Phase 6 — absolute URL to the analytics ingest endpoint, e.g.
     * `{APP_URL}/api/events/track`. When null/empty, the template
     * omits the beacon script entirely.
     */
    analyticsEndpoint?: string | null;
    /**
     * Phase 6 — the portfolio id the analytics beacon sends with each
     * event. Required alongside `analyticsEndpoint`.
     */
    analyticsPortfolioId?: string | null;
  };

  basics: {
    name: string;
    label: string;
    email?: string;
    phone?: string;
    url?: string;
    summary: string;
    location?: {
      city?: string;
      region?: string;
      country?: string;
    };
    avatar?: string;
    profiles: SocialProfile[];
  };

  skills: Skill[];
  projects: Project[];
  experience?: Experience[];
  education?: Education[];

  chatbot?: {
    enabled: boolean;
    /**
     * @deprecated Phase 8.5 — retained so pre-8.5 generated HTML that
     * references this field doesn't crash. New templates use `appOrigin`
     * + an inline snippet instead of a cross-origin script tag. Remove
     * in a later phase once no template reads it.
     */
    apiEndpoint: string;
    /**
     * Phase 8.5 — the builder app origin, e.g. `https://portfolio.example
     * .com`. The inline chatbot bootstrap uses this to construct the
     * iframe src. Decouples the published page's script load from the
     * builder — only the iframe load depends on the builder being
     * reachable, and that load already degrades gracefully.
     *
     * Phase 9 — when `selfHosted` is true, this field may be empty. The
     * bootstrap points at `/chat.html` on the same origin instead.
     */
    appOrigin: string;
    portfolioId: string;
    /**
     * Phase 9 — when true, the chatbot is hosted on the published site
     * itself via a Cloudflare Pages Function. The iframe loads
     * `/chat.html` on the same origin and `/api/chat/stream` is served
     * by a co-deployed Worker. Default false (Phase 8.5 cross-origin
     * behavior).
     */
    selfHosted?: boolean;
  };
}

export interface SocialProfile {
  network: string;
  username: string;
  url: string;
}

export interface Skill {
  name: string;
  category: "language" | "framework" | "tool" | "concept" | "other";
  proficiency?: "beginner" | "intermediate" | "advanced" | "expert";
  evidence?: Array<{
    projectName: string;
    usage: string;
  }>;
}

export interface Project {
  id: string;
  name: string;
  repoUrl: string;
  description: string;
  techStack: string[];
  isFeatured: boolean;
  displayOrder: number;

  sections: {
    summary: string;
    architecture?: string;
    techNarrative?: string;
    recruiterPitch?: string;
    engineerDeepDive?: string;
  };

  metadata: {
    stars?: number;
    forks?: number;
    language?: string;
    topics?: string[];
    lastUpdated?: string;
    license?: string;
  };

  facts: ProjectFact[];
  screenshot?: string;

  /**
   * Phase 8 — optional one-line honest characterization of the project
   * ("Solo side project — 4 months, 18 active days, deployed at …"). When
   * present, templates render it as a muted byline under the project title.
   * When absent, the byline is omitted entirely.
   *
   * The string is baked into the generated HTML at build time via
   * `profile-data.ts`. It crosses from the builder's credibility layer to
   * the published portfolio as plain text — no runtime fetch, no class
   * inference on the visitor's browser. See the Phase 8 plan's
   * "Decoupling guarantee" section for the invariant this field upholds.
   */
  characterization?: string;
}

export interface ProjectFact {
  claim: string;
  category: string;
  evidenceRef?: string;
}

export interface Experience {
  company: string;
  position: string;
  startDate: string;
  endDate?: string;
  summary?: string;
  highlights?: string[];
}

export interface Education {
  institution: string;
  area: string;
  studyType: string;
  startDate?: string;
  endDate?: string;
}
