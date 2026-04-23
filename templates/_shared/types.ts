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
    /**
     * Phase A — sharp one-liner positioning the owner (e.g. "I build
     * accessible, pixel-perfect experiences for the web"). When present,
     * templates prefer this over `label` as the hero tagline. Absent means
     * no positioning set — fall through to `label`.
     */
    positioning?: string;
    /**
     * Phase A — recognizable employer/client names surfaced in the hero
     * (e.g. ["Apple", "Klaviyo"]). Source of truth is `portfolios
     * .namedEmployers` jsonb. Empty array ⇒ no "Previously at" line.
     */
    namedEmployers?: string[];
    /**
     * Phase A — explicit hiring status surfaced as a hero CTA. Absent
     * means no CTA rendered (default neutral portfolio). "available"
     * renders the CTA prominently; "open" renders a muted CTA; "not-
     * looking" suppresses the CTA.
     */
    hiring?: {
      status: "available" | "open" | "not-looking";
      ctaText?: string;
      ctaHref?: string;
    };
    /**
     * Phase A — the single strongest credential the hero leads with
     * ("4k+ GitHub stars on text-to-handwriting"). Phase A only exposes
     * the user-supplied override; Phase B fills in a pipeline-computed
     * default when no override is set.
     */
    anchorStat?: {
      value: string;
      unit: string;
      context?: string;
      sourceRef?: string;
    };
  };

  skills: Skill[];
  projects: Project[];
  experience?: Experience[];
  education?: Education[];
  /**
   * Phase A — user-curated testimonials with named authors. Stored in a
   * dedicated `testimonials` table keyed on portfolioId. Omitted when
   * the portfolio has none.
   */
  testimonials?: Testimonial[];

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
   * Phase A — quantified outcomes the project produced (user counts,
   * performance wins, adoption). Seeded by Phase B's fact-extract step
   * (facts with category === "outcome") and user-editable via the
   * project editor. Each entry should have a numeric value; the
   * `context` phrase is freely editable but the value itself stays
   * tied to an extracted fact (Tier 3 in the editability model).
   */
  outcomes?: ProjectOutcome[];

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

export interface Testimonial {
  quote: string;
  authorName: string;
  authorTitle?: string;
  authorCompany?: string;
  authorUrl?: string;
  avatarUrl?: string;
}

export interface ProjectOutcome {
  metric: string;
  value: string;
  context?: string;
  evidenceRef?: string;
}

export interface Education {
  institution: string;
  area: string;
  studyType: string;
  startDate?: string;
  endDate?: string;
}
