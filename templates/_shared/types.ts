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
    apiEndpoint: string;
    portfolioId: string;
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
