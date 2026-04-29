/**
 * Phase 5 — Turn a portfolio's structured data into retrieval-ready chunks.
 *
 * We keep this pure (no DB coupling): the caller loads rows and passes
 * them in. The pipeline step wraps this in `embedding-generate.ts`, and
 * tests pass in handcrafted rows.
 *
 * Chunking rules (plan §Chunking):
 *   - 1 chunk per `facts` row: "{category}: {claim}\nEvidence: {evidenceText}"
 *     (evidence truncated to FACT_EVIDENCE_TRUNCATE_CHARS)
 *   - 1 chunk per `derived_facts` row: the claim text
 *   - N chunks per `generated_sections` row — one per paragraph
 *     (split on blank lines; paragraphs > CHUNK_MAX_CHARS get further
 *     split on sentence boundaries)
 *   - 1 chunk per project: "Project: {name}\n{description}\nStack: {stack}"
 *   - 1 profile chunk per portfolio: "{name} — {bio}\nSkills: {topSkills}"
 */

import {
  CHUNK_MAX_CHARS,
  FACT_EVIDENCE_TRUNCATE_CHARS,
  type EmbeddingChunk,
} from "./types";

// ─── Input shapes (minimal — only what the chunker reads) ──────────────────

export interface ChunkerFactRow {
  id: string;
  projectId: string;
  category: string;
  claim: string;
  evidenceText: string | null;
}

export interface ChunkerDerivedFactRow {
  id: string;
  projectId: string;
  claim: string;
}

export interface ChunkerSectionRow {
  id: string;
  projectId: string;
  sectionType: string;
  /** If the owner hand-edited, prefer that over the model's draft. */
  content: string;
  userContent?: string | null;
  isUserEdited?: boolean | null;
}

export interface ChunkerProjectRow {
  id: string;
  name: string;
  description?: string | null;
  /** Free-form stack summary; "React, TypeScript, Postgres" etc. */
  stackSummary?: string | null;
}

export interface ChunkerProfileInput {
  portfolioId: string;
  ownerName: string;
  bio?: string | null;
  topSkills?: string[] | null;
  /**
   * Phase R6 — career data baked into the retrieval corpus so the chatbot
   * can answer "which companies has he worked for", "is he available?",
   * "what's his current role?" without falling back to the canned out-of-
   * scope refusal. Each field is optional; absent ones are silently
   * skipped from the chunk.
   */
  positioning?: string | null;
  currentRole?: string | null;
  currentCompany?: string | null;
  namedEmployers?: string[] | null;
  hiring?: {
    status: "available" | "open" | "not-looking";
    ctaText?: string | null;
    ctaHref?: string | null;
  } | null;
  availability?: {
    kind: "available_now" | "available_after" | "open_to_chat" | "not_looking";
    startDate?: string | null;
  } | null;
  experience?: Array<{
    company: string;
    position: string;
    startDate?: string | null;
    endDate?: string | null;
    summary?: string | null;
    highlights?: string[] | null;
  }> | null;
  /**
   * Phase R8 — location surfaced into the chatbot corpus so visitors
   * asking "where is he based" get the city / region / country instead
   * of the canned "I don't have that detail" refusal. Source matches
   * what `assembleProfileData` reads (portfolios.locationOverride →
   * resumeJson.basics.location).
   */
  location?: {
    city?: string | null;
    region?: string | null;
    country?: string | null;
  } | null;
  /**
   * Phase R8 — Tier-1 recruiter signals about role preferences. Each
   * flag is independently optional. `ic`, `fullTime`, `remote` etc. all
   * `true` ⇒ the chunk emits "Open to IC, full-time, remote roles".
   */
  roleTypes?: {
    ic?: boolean;
    manager?: boolean;
    fullTime?: boolean;
    contract?: boolean;
    remote?: boolean;
    hybrid?: boolean;
    onsite?: boolean;
    // Phase R8 — relocation willingness. When true the availability
    // chunk surfaces "Open to relocation" so the bot can answer
    // "would he relocate?" / "is he willing to move".
    openToRelocation?: boolean;
  } | null;
  /**
   * Phase R8 — work-eligibility regions. Free-form strings ("US", "UK",
   * "TN visa", "EU"). Surfaces the right answer to "is he authorized to
   * work in X" and "does he need sponsorship".
   */
  workEligibility?: string[] | null;
}

export interface ChunkerInput {
  profile: ChunkerProfileInput;
  projects: ChunkerProjectRow[];
  /** Keyed by projectId for O(1) joins. */
  factsByProject: Map<string, ChunkerFactRow[]>;
  derivedFactsByProject: Map<string, ChunkerDerivedFactRow[]>;
  sectionsByProject: Map<string, ChunkerSectionRow[]>;
}

// ─── Entry point ────────────────────────────────────────────────────────────

/**
 * Build the complete chunk set for a portfolio. Deterministic given the
 * same input → idempotent re-embed runs produce identical chunks.
 *
 * Ordering matters for deterministic tie-breaks in retrieval:
 *   profile → projects (per-project: summary → facts → derived → narrative).
 */
export function buildChunks(input: ChunkerInput): EmbeddingChunk[] {
  const out: EmbeddingChunk[] = [];

  // 1. Profile chunk — always exactly one per portfolio.
  out.push(buildProfileChunk(input.profile));

  // 1b. Career chunk — Phase R6. Emits a separate chunk for employers +
  //     experience history so embedding similarity can match queries like
  //     "where has he worked" / "previous companies" without being diluted
  //     by the bio/skills text in the profile chunk. Skipped silently
  //     when no career data is set.
  const careerChunk = buildCareerChunk(input.profile);
  if (careerChunk) out.push(careerChunk);

  // 1c. Availability chunk — Phase R6. Same logic for hiring status +
  //     current role. Lets "is he available?" retrieve the right
  //     answer even when the bio/skills are unrelated.
  const availabilityChunk = buildAvailabilityChunk(input.profile);
  if (availabilityChunk) out.push(availabilityChunk);

  // 2. Per project, in the order given by the caller.
  for (const project of input.projects) {
    out.push(buildProjectSummaryChunk(project));

    const facts = input.factsByProject.get(project.id) ?? [];
    for (const f of facts) {
      out.push(buildFactChunk(f, project));
    }

    const derived = input.derivedFactsByProject.get(project.id) ?? [];
    for (const d of derived) {
      out.push(buildDerivedFactChunk(d, project));
    }

    const sections = input.sectionsByProject.get(project.id) ?? [];
    for (const s of sections) {
      out.push(...buildNarrativeChunks(s, project));
    }
  }

  return out;
}

// ─── Individual builders ────────────────────────────────────────────────────

function buildProfileChunk(profile: ChunkerProfileInput): EmbeddingChunk {
  const bio = (profile.bio ?? "").trim();
  const skills = (profile.topSkills ?? []).filter(Boolean).join(", ");

  // Phase R8 — identity sentence as the first line. Eval surfaced "tell
  // me about him" returning a literal "[insert details from context]"
  // template leak because there was no clean identity statement in the
  // corpus. This composes one from the live fields so retrieval has a
  // crisp single sentence to anchor on.
  // R8.3 — prefix with "Background:" so "What's his background?" /
  // "Tell me about his background" queries match this chunk over the
  // project_summary chunks (eval v3 still had Q2 returning project
  // lists). The keyword is the highest-leverage retrieval anchor for
  // that specific phrasing.
  const identity = buildIdentitySentence(profile);

  const parts: string[] = [`Background: ${identity}`];
  if (bio) parts.push(bio);
  if (skills) parts.push(`Skills and tech stack: ${skills}`);

  return {
    chunkType: "profile",
    chunkText: parts.join("\n"),
    sourceRef: `profile:${profile.portfolioId}`,
    metadata: { portfolioId: profile.portfolioId },
  };
}

/**
 * Phase R8 — compose an identity sentence from the live fields. Skips
 * any clause that has no data so the sentence stays grammatical:
 *
 *   "Shashank C M is a Backend Engineer at Abbott Labs based in Plano,
 *   TX, with 6+ years of professional experience."
 *
 * Falls back to "<Name>." when nothing else is set.
 */
function buildIdentitySentence(profile: ChunkerProfileInput): string {
  const name = profile.ownerName;
  const role = profile.currentRole?.trim();
  const company = profile.currentCompany?.trim();
  const place = formatLocation(profile.location);
  const years = computeYearsOfExperience(profile.experience);

  const clauses: string[] = [];
  if (role && company) clauses.push(`is a ${role} at ${company}`);
  else if (role) clauses.push(`is a ${role}`);
  else if (company) clauses.push(`works at ${company}`);

  if (place) clauses.push(`based in ${place}`);
  if (years) clauses.push(`with ${years}+ years of professional experience`);

  if (clauses.length === 0) return `${name}.`;
  return `${name} ${clauses.join(", ")}.`;
}

function formatLocation(
  loc: ChunkerProfileInput["location"]
): string | null {
  if (!loc) return null;
  const city = loc.city?.trim();
  const region = loc.region?.trim();
  const country = loc.country?.trim();
  // Common shapes: "Plano, TX" / "London, UK" / "Berlin, Germany" / "TX"
  if (city && region) return `${city}, ${region}`;
  if (city && country) return `${city}, ${country}`;
  return city || region || country || null;
}

/**
 * R8.1 — sum actual role durations rather than `currentYear -
 * earliestStart`. The naive earliest-start subtraction over-counts
 * career breaks (grad school, sabbatical, parental leave), which made
 * shashank-cm's 6+-years bio render as "9+ years" because his Allstate
 * → masters → Liberty Defense gap was rolled in.
 *
 * Algorithm: for each experience entry compute (end - start) in months,
 * with `endDate` falling back to today when null/"Present". Sum, divide
 * by 12, floor. Overlapping roles (rare but possible — moonlighting,
 * advisory) are summed naively — slight over-count is acceptable; the
 * alternative (interval-merging) is more code than it's worth here.
 */
function computeYearsOfExperience(
  experience: ChunkerProfileInput["experience"]
): number | null {
  if (!experience || experience.length === 0) return null;
  let totalMonths = 0;
  const now = new Date();
  for (const e of experience) {
    const start = parseRoleDate(e.startDate);
    if (start === null) continue;
    const end = parseRoleDate(e.endDate) ?? now;
    if (end <= start) continue;
    const months =
      (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (end.getUTCMonth() - start.getUTCMonth());
    if (months > 0) totalMonths += months;
  }
  const years = Math.floor(totalMonths / 12);
  // Sanity bounds: 1..50. Anything else is a data error; skip rather
  // than emit "with 0+ years" or "with 73+ years".
  if (years < 1 || years > 50) return null;
  return years;
}

/**
 * R8.2 — pull the current-company tenure in months out of the
 * experience array (the most recent role with no endDate / endDate
 * past today). Used to answer "how long at <company>" without
 * conflating it with the career total. Returns null when no current
 * role can be identified.
 */
function computeCurrentTenureMonths(
  experience: ChunkerProfileInput["experience"]
): number | null {
  if (!experience || experience.length === 0) return null;
  const now = new Date();
  let bestStart: Date | null = null;
  for (const e of experience) {
    const end = parseRoleDate(e.endDate);
    // Current role = no parseable endDate (null / "Present" / "Current") OR
    // an endDate in the future.
    const isCurrent = end === null || end > now;
    if (!isCurrent) continue;
    const start = parseRoleDate(e.startDate);
    if (start === null) continue;
    // Pick the role with the LATEST start (the actual "current" role
    // when there are multiple rows tagged as ongoing).
    if (bestStart === null || start > bestStart) bestStart = start;
  }
  if (bestStart === null || bestStart > now) return null;
  const months =
    (now.getUTCFullYear() - bestStart.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - bestStart.getUTCMonth());
  return months > 0 ? months : null;
}

/**
 * Format a month count as a human-readable tenure string. Picks the
 * smallest unit that doesn't lose information:
 *   3   → "3 months"
 *   12  → "1 year"
 *   18  → "1 year and 6 months"
 *   36  → "3 years"
 */
function formatTenure(months: number): string {
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  const yearPart = `${years} year${years === 1 ? "" : "s"}`;
  if (remMonths === 0) return yearPart;
  return `${yearPart} and ${remMonths} month${remMonths === 1 ? "" : "s"}`;
}

/**
 * Parse a resume-style date — accepts "YYYY", "YYYY-MM", "YYYY-MM-DD",
 * or null/"Present"/"Current"/etc. Returns a Date for valid inputs,
 * null for "Present"-style strings or unparseable values. Defaults
 * the day to the 1st of the month so partial dates compare cleanly.
 */
function parseRoleDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Reject "Present" / "Current" / other non-date strings.
  if (!/^\d{4}/.test(trimmed)) return null;
  // YYYY → YYYY-01-01. YYYY-MM → YYYY-MM-01. YYYY-MM-DD passes through.
  const m = trimmed.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
  if (!m) return null;
  const year = Number.parseInt(m[1], 10);
  const month = m[2] ? Number.parseInt(m[2], 10) - 1 : 0;
  const day = m[3] ? Number.parseInt(m[3], 10) : 1;
  if (year < 1900 || year > 2100) return null;
  if (month < 0 || month > 11) return null;
  return new Date(Date.UTC(year, month, day));
}

/**
 * Phase R6 — career chunk. Surfaces the data that drives "which
 * companies has he worked for" / "tell me about his work history" /
 * "where did he work before". Returns null when no career data exists,
 * so old portfolios that haven't filled in employers + experience get
 * a smaller (but still functional) corpus rather than empty chunks.
 */
function buildCareerChunk(
  profile: ChunkerProfileInput
): EmbeddingChunk | null {
  const employers = (profile.namedEmployers ?? []).filter(Boolean);
  const experience = (profile.experience ?? []).filter(
    (e) => e && e.company && e.position
  );

  if (employers.length === 0 && experience.length === 0) {
    return null;
  }

  // R8.2 — lead with a Q&A-shaped sentence so the embedding similarity
  // for the literal recruiter query "Where has he worked?" anchors on
  // THIS chunk, not the project_summary chunks that mention only his
  // current company. Eval v2 confirmed the v1 phrasing still under-
  // performed; the literal-question phrasing is the highest-leverage
  // fix without resorting to retrieval re-ranking.
  const employerList = employers.length > 0 ? employers.join(", ") : null;
  const leadLine = employerList
    ? `Where has ${profile.ownerName} worked? Companies he has worked for: ${employerList}. Previously at: ${employerList}. ${profile.ownerName}'s career and work history.`
    : `${profile.ownerName}'s career and work history.`;
  const parts: string[] = [leadLine];

  if (employers.length > 0) {
    parts.push(
      `Companies ${profile.ownerName} has worked for: ${employerList}.`
    );
  }

  if (experience.length > 0) {
    const lines = experience.map((e) => {
      const range = formatExperienceRange(e.startDate, e.endDate);
      const head = `${e.position} at ${e.company}${range ? ` (${range})` : ""}`;
      const summary = e.summary?.trim() ?? "";
      const highlights = (e.highlights ?? [])
        .filter(Boolean)
        .slice(0, 3)
        .join("; ");
      const tail = [summary, highlights].filter(Boolean).join(" ");
      return tail ? `${head} — ${tail}` : head;
    });
    parts.push(`Roles:\n${lines.join("\n")}`);

    // Phase R8 — also append a one-line "Companies: A (yyyy–yyyy), B
    // (current), …" summary so a query like "list his companies" or
    // "all his employers" lands on a single readable line rather than
    // having to assemble pieces from the per-role block above.
    const summaryLine = experience
      .map((e) => {
        const range = formatExperienceRange(e.startDate, e.endDate);
        return range ? `${e.company} (${range})` : e.company;
      })
      .join(", ");
    parts.push(`Companies: ${summaryLine}.`);
  }

  return {
    chunkType: "career",
    chunkText: parts.join("\n"),
    sourceRef: `career:${profile.portfolioId}`,
    metadata: { portfolioId: profile.portfolioId },
  };
}

/**
 * Phase R6 — availability chunk. Surfaces hiring status + current role
 * so "is he available", "what's he doing now", "is he looking for work"
 * land on real data. Returns null when neither hiring status nor current
 * role is set.
 */
function buildAvailabilityChunk(
  profile: ChunkerProfileInput
): EmbeddingChunk | null {
  const lines: string[] = [];

  // R8.4 — current employment is intentionally NOT surfaced in the
  // availability chunk anymore. Putting "currently working at <X>" next
  // to "currently available for new work" was being read as logically
  // contradictory by the model (eval v4 caught the bot refusing
  // "is he available?" because of the apparent conflict). Current
  // employment is already in the profile chunk's identity sentence and
  // in the career chunk's roles list, so the availability chunk can
  // focus purely on what's *new-work-related*.
  //
  // Earlier R8.4 emitted two lines (one from hiring.status, one from
  // availability.kind) which became a duplicate when both were set.
  // The fix below picks ONE canonical openness sentence using the
  // strongest available signal: hiring.status "available" wins over
  // anything else, then availability.kind, then hiring.status "open".

  const h = profile.hiring;
  const a = profile.availability;
  const employed = profile.currentCompany?.trim() || null;
  const at = employed ? ` (employed at ${employed} and exploring)` : "";
  const ctaSuffix = h?.ctaText ? ` His preferred contact CTA: "${h.ctaText}".` : "";

  if (h?.status === "available") {
    // Strongest "actively looking" signal. Phrasing emphasises OPENNESS,
    // not present-tense availability — avoids the "but he's at Abbott
    // right now" contradiction the model was tripping on. Drops the
    // duplicate availability.kind line entirely; this single sentence
    // covers both signals.
    lines.push(
      `${profile.ownerName} is open to new job opportunities${at}.${ctaSuffix}`
    );
  } else if (a?.kind === "available_after" && a.startDate) {
    // Future-dated availability — surface the start date.
    lines.push(
      `${profile.ownerName} will be ready to start a new role around ${a.startDate}.`
    );
  } else if (h?.status === "open" || a?.kind === "open_to_chat") {
    // Soft signal — open to conversations but not actively looking.
    lines.push(
      `${profile.ownerName} is open to conversations about new opportunities${at}.`
    );
  }

  if (profile.positioning) {
    lines.push(`Positioning: ${profile.positioning}`);
  }

  // Phase R8 — location surfaces "where is he based" / "where does he
  // live" queries. Eval found these were hitting the canned refusal
  // because the field never made it into the corpus.
  const place = formatLocation(profile.location);
  if (place) {
    lines.push(`${profile.ownerName} is based in ${place}.`);
  }

  // Phase R8 — role types. Compose a single human sentence from the
  // boolean flags so embedding matches "is he open to remote" /
  // "interested in IC roles" / "contract or full-time" cleanly.
  const roleTypePhrase = formatRoleTypes(profile.roleTypes);
  if (roleTypePhrase) {
    lines.push(`Open to: ${roleTypePhrase}.`);
  }

  // Phase R8 — work eligibility. "Authorized to work in X" matches
  // recruiter visa / sponsorship questions.
  const eligibility = (profile.workEligibility ?? []).filter((e) => e?.trim());
  if (eligibility.length > 0) {
    lines.push(
      `${profile.ownerName} is authorized to work in: ${eligibility.join(", ")}.`
    );
  }

  // Phase R8 — total years of experience. R8.2 — explicitly phrased as
  // "career total" / "across multiple roles" so the model doesn't
  // conflate this with tenure at the current company (eval v2 caught
  // the bot answering "9+ years at Abbott Labs" by mashing the
  // adjacent currentCompany line with the years count).
  const years = computeYearsOfExperience(profile.experience);
  if (years) {
    lines.push(
      `Across his career, ${profile.ownerName} has ${years}+ years of total professional software-engineering experience (summed across multiple roles, not tenure at any single company).`
    );
  }
  // R8.2 — explicit current-company tenure as its own line so questions
  // like "how long at Abbott" land on a precise number rather than the
  // career total.
  // R8.3 — phrase WITHOUT the verb "worked" / "has been at" so the line
  // doesn't compete with the career chunk for "where has he worked"
  // queries (eval v3 caught this regression). "<Name>'s tenure at <X>
  // is Y" is unambiguous about what's being asked.
  const currentTenure = computeCurrentTenureMonths(profile.experience);
  if (currentTenure !== null && profile.currentCompany) {
    lines.push(
      `${profile.ownerName}'s tenure at ${profile.currentCompany} is ${formatTenure(currentTenure)}.`
    );
  }

  if (lines.length === 0) {
    return null;
  }

  return {
    chunkType: "availability",
    chunkText: lines.join("\n"),
    sourceRef: `availability:${profile.portfolioId}`,
    metadata: { portfolioId: profile.portfolioId },
  };
}

/**
 * Phase R8 — format the seven-bool roleTypes object as a comma list
 * of human-readable terms. Returns null when nothing is set / all
 * false so the caller can drop the line entirely.
 */
function formatRoleTypes(
  rt: ChunkerProfileInput["roleTypes"]
): string | null {
  if (!rt) return null;
  const out: string[] = [];
  // R8.2 — expand "IC" so the model doesn't mis-decode it as "in-house"
  // (eval v2 caught the bot saying "open to IC (in-house) roles only").
  if (rt.ic) out.push("Individual Contributor (IC) roles");
  if (rt.manager) out.push("Engineering Manager / lead roles");
  if (rt.fullTime) out.push("full-time");
  if (rt.contract) out.push("contract");
  // Combine remote+hybrid+onsite into a "<x>/<y>" group when multiple
  // are set so the output reads naturally.
  const locModes: string[] = [];
  if (rt.remote) locModes.push("remote");
  if (rt.hybrid) locModes.push("hybrid");
  if (rt.onsite) locModes.push("onsite");
  if (locModes.length > 0) out.push(locModes.join("/"));
  // Phase R8 — relocation flag is independent: someone can be open to
  // onsite + open to relocating, or remote-only + open to relocating.
  // Append as a separate clause rather than mixing with the loc modes.
  if (rt.openToRelocation) out.push("relocation");
  return out.length > 0 ? out.join(", ") : null;
}

/**
 * Format a YYYY-MM-DD or YYYY date range as "2021 — 2024" / "2024 — Present".
 * Tolerates partial / ISO / unparseable dates and falls back to the raw
 * string rather than producing "NaN — NaN".
 */
function formatExperienceRange(
  startDate?: string | null,
  endDate?: string | null
): string {
  const start = (startDate ?? "").slice(0, 4);
  // R8 — endDate may legitimately be the string "Present" or "Current" in
  // some resume JSON shapes (rather than null). Only slice when it looks
  // like a date — i.e. starts with 4 digits — otherwise pass through.
  const end = endDate
    ? /^\d{4}/.test(endDate)
      ? endDate.slice(0, 4)
      : endDate
    : "Present";
  if (!start) return "";
  if (start === end) return start;
  return `${start} — ${end}`;
}

function buildProjectSummaryChunk(
  project: ChunkerProjectRow
): EmbeddingChunk {
  const desc = (project.description ?? "").trim();
  const stack = (project.stackSummary ?? "").trim();

  const parts: string[] = [`Project: ${project.name}`];
  if (desc) parts.push(desc);
  if (stack) parts.push(`Stack: ${stack}`);

  return {
    chunkType: "project_summary",
    chunkText: parts.join("\n"),
    sourceRef: `projects:${project.id}`,
    metadata: { projectId: project.id, projectName: project.name },
  };
}

function buildFactChunk(
  fact: ChunkerFactRow,
  project: ChunkerProjectRow
): EmbeddingChunk {
  const evidence = truncate(
    (fact.evidenceText ?? "").trim(),
    FACT_EVIDENCE_TRUNCATE_CHARS
  );
  const parts: string[] = [`${fact.category}: ${fact.claim}`];
  if (evidence) parts.push(`Evidence: ${evidence}`);

  return {
    chunkType: "fact",
    chunkText: parts.join("\n"),
    sourceRef: `facts:${fact.id}`,
    metadata: {
      projectId: project.id,
      projectName: project.name,
      category: fact.category,
    },
  };
}

function buildDerivedFactChunk(
  d: ChunkerDerivedFactRow,
  project: ChunkerProjectRow
): EmbeddingChunk {
  return {
    chunkType: "derived_fact",
    chunkText: d.claim,
    sourceRef: `derivedFacts:${d.id}`,
    metadata: { projectId: project.id, projectName: project.name },
  };
}

/**
 * Split a generated section into paragraph-scoped chunks. Paragraphs
 * longer than CHUNK_MAX_CHARS are further sentence-split so no single
 * chunk blows the token budget.
 *
 * Honor `isUserEdited`: when true and `userContent` is non-empty, we
 * embed the owner's edited copy instead of the model's draft. The
 * narrative the visitor sees on the published site is the source of
 * truth.
 */
function buildNarrativeChunks(
  section: ChunkerSectionRow,
  project: ChunkerProjectRow
): EmbeddingChunk[] {
  const content =
    section.isUserEdited && section.userContent?.trim()
      ? section.userContent
      : section.content;

  const paragraphs = splitParagraphs(content);
  const out: EmbeddingChunk[] = [];

  paragraphs.forEach((para, idx) => {
    const pieces = para.length > CHUNK_MAX_CHARS ? sentenceSplit(para) : [para];
    pieces.forEach((piece, pieceIdx) => {
      out.push({
        chunkType: "narrative",
        chunkText: piece,
        sourceRef:
          pieces.length === 1
            ? `generatedSections:${section.id}#para=${idx}`
            : `generatedSections:${section.id}#para=${idx}.${pieceIdx}`,
        metadata: {
          projectId: project.id,
          projectName: project.name,
          sectionType: section.sectionType,
        },
      });
    });
  });

  return out;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Split on blank-line paragraph boundaries. Empty paragraphs dropped. */
export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Greedy sentence packer. Splits on `.`, `!`, `?` followed by whitespace,
 * then packs sentences back together until a group would exceed
 * CHUNK_MAX_CHARS. A single sentence longer than the cap is emitted
 * as-is (we don't hard-cut in the middle of a word).
 */
export function sentenceSplit(paragraph: string): string[] {
  const sentences = paragraph
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length === 0) return [paragraph];

  const chunks: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if (!buf) {
      buf = s;
      continue;
    }
    if (buf.length + 1 + s.length <= CHUNK_MAX_CHARS) {
      buf = `${buf} ${s}`;
    } else {
      chunks.push(buf);
      buf = s;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}
