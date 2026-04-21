import {
  aggregateSuggestions,
  suggestImprovements,
  SUGGESTION_CONTENT,
  type Suggestion,
} from "@/lib/credibility/suggestions";
import { scoreAuthorship } from "@/lib/credibility/authorship";
import {
  CREDIBILITY_SCHEMA_VERSION,
  type CredibilitySignals,
} from "@/lib/credibility/types";

const DAY = 1000 * 60 * 60 * 24;
const now = Date.now();
const isoDaysAgo = (n: number) => new Date(now - n * DAY).toISOString();

function baseSignals(
  overrides: Partial<CredibilitySignals> = {}
): CredibilitySignals {
  const partial: Omit<CredibilitySignals, "authorshipSignal"> = {
    schemaVersion: CREDIBILITY_SCHEMA_VERSION,
    ci: { status: "missing" },
    recency: {
      status: "ok",
      createdAt: isoDaysAgo(365),
      lastPushedAt: isoDaysAgo(10),
    },
    releases: { status: "missing" },
    workflows: { status: "missing" },
    languages: { status: "error" },
    topics: { status: "missing" },
    commits: {
      status: "ok",
      total: 10,
      firstAt: isoDaysAgo(100),
      lastAt: isoDaysAgo(10),
    },
    contributors: { status: "ok", count: 1 },
    issuesAndPRs: { status: "ok", closedTotal: 0 },
    testFramework: { status: "missing" },
    verifiedStack: { status: "missing" },
    commitActivity: { status: "ok", activeDayCount: 5, totalWeeks: 52 },
    commitMessages: {
      status: "ok",
      total: 10,
      meaningfulCount: 2,
      sample: [],
    },
    externalUrl: null,
    ...overrides,
  };
  return {
    ...partial,
    authorshipSignal: scoreAuthorship(partial as CredibilitySignals),
  };
}

describe("suggestImprovements", () => {
  it("returns empty array when all factors are positive (Case D-like)", () => {
    const signals = baseSignals({
      commitActivity: { status: "ok", activeDayCount: 200, totalWeeks: 52 },
      commitMessages: {
        status: "ok",
        total: 30,
        meaningfulCount: 28,
        sample: [],
      },
      contributors: { status: "ok", count: 5 },
      issuesAndPRs: { status: "ok", closedTotal: 50 },
      releases: {
        status: "ok",
        count: 10,
        latestTag: "v2.0",
        latestAt: isoDaysAgo(5),
      },
      externalUrl: "https://example.com",
      recency: {
        status: "ok",
        createdAt: isoDaysAgo(730),
        lastPushedAt: isoDaysAgo(2),
      },
    });
    expect(suggestImprovements(signals)).toEqual([]);
  });

  it("emits one suggestion for each non-positive factor (Case A-like)", () => {
    const signals = baseSignals({
      commitActivity: { status: "ok", activeDayCount: 1, totalWeeks: 52 },
      commitMessages: {
        status: "ok",
        total: 1,
        meaningfulCount: 0,
        sample: ["initial commit"],
      },
      contributors: { status: "ok", count: 1 },
      issuesAndPRs: { status: "ok", closedTotal: 0 },
      releases: { status: "missing" },
      externalUrl: null,
      recency: {
        status: "ok",
        createdAt: isoDaysAgo(1),
        lastPushedAt: isoDaysAgo(1),
      },
    });
    const suggestions = suggestImprovements(signals);
    // Six factors, all non-positive → six suggestions
    expect(suggestions).toHaveLength(6);
    const ids = suggestions.map((s) => s.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "spread-commits",
        "commit-messages-descriptive",
        "use-prs",
        "tag-release",
        "add-homepage-url",
        "keep-active",
      ])
    );
  });

  it("orders suggestions by impact: negative-to-positive first", () => {
    const signals = baseSignals({
      // Mix: commitDays=5 (neutral), messageQuality=2/10 (negative),
      // collaboration=0 (negative), releases=missing (negative),
      // externalUrl=null (negative), recency mature/active (positive)
      commitActivity: { status: "ok", activeDayCount: 5, totalWeeks: 52 },
      commitMessages: {
        status: "ok",
        total: 10,
        meaningfulCount: 2,
        sample: [],
      },
      recency: {
        status: "ok",
        createdAt: isoDaysAgo(100),
        lastPushedAt: isoDaysAgo(5),
      },
    });
    const suggestions = suggestImprovements(signals);

    // Suggestions with impact=negative-to-positive should sort before
    // negative-to-neutral or neutral-to-positive.
    const impacts = suggestions.map((s) => s.impact);
    const firstNegToNeutral = impacts.indexOf("negative-to-neutral");
    const lastNegToPositive = impacts.lastIndexOf("negative-to-positive");
    if (firstNegToNeutral !== -1 && lastNegToPositive !== -1) {
      expect(lastNegToPositive).toBeLessThan(firstNegToNeutral);
    }
  });

  it("returns empty when authorshipSignal status is 'missing'", () => {
    const signals = baseSignals({
      commits: { status: "error" },
      commitActivity: { status: "error" },
      commitMessages: { status: "error" },
    });
    expect(signals.authorshipSignal.status).toBe("missing");
    expect(suggestImprovements(signals)).toEqual([]);
  });

  it("each suggestion has stable id and user-visible copy", () => {
    const signals = baseSignals(); // mostly non-positive
    const suggestions = suggestImprovements(signals);
    for (const s of suggestions) {
      expect(s.id).toBeTruthy();
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.description.length).toBeGreaterThan(20);
      expect(["commitDays", "messageQuality", "collaboration", "releases", "externalPresence", "ageVsPush"]).toContain(
        s.factorAffected
      );
      // Content table should agree
      const canonical = SUGGESTION_CONTENT[s.id];
      expect(canonical.title).toBe(s.title);
    }
  });

  it("labels factors with a neutral band as negative-to-neutral (not -to-positive)", () => {
    // commitDays has a neutral band; releases does not
    const signals = baseSignals({
      commitActivity: { status: "ok", activeDayCount: 1, totalWeeks: 52 },
      releases: { status: "missing" },
    });
    const suggestions = suggestImprovements(signals);
    const commitDays = suggestions.find((s) => s.factorAffected === "commitDays");
    const releases = suggestions.find((s) => s.factorAffected === "releases");
    expect(commitDays?.impact).toBe("negative-to-neutral");
    expect(releases?.impact).toBe("negative-to-positive");
  });

  // ─── Phase 8 — category + dismissal filters ────────────────────────────

  it("filters out suggestions not applicable to the category", () => {
    // A "weak" bundle would normally emit all 6 suggestions; under
    // personal_learning, only `commit-messages-descriptive` should remain.
    const signals = baseSignals({
      commitActivity: { status: "ok", activeDayCount: 1, totalWeeks: 52 },
      commitMessages: {
        status: "ok",
        total: 1,
        meaningfulCount: 0,
        sample: ["wip"],
      },
      releases: { status: "missing" },
      externalUrl: null,
      recency: {
        status: "ok",
        createdAt: isoDaysAgo(3),
        lastPushedAt: isoDaysAgo(1),
      },
    });
    const learning = suggestImprovements(signals, {
      category: "personal_learning",
    });
    expect(learning.map((s) => s.id)).toEqual([
      "commit-messages-descriptive",
    ]);
  });

  it("removes dismissed suggestion ids", () => {
    const signals = baseSignals({
      commitActivity: { status: "ok", activeDayCount: 1, totalWeeks: 52 },
      commitMessages: {
        status: "ok",
        total: 1,
        meaningfulCount: 0,
        sample: ["wip"],
      },
      releases: { status: "missing" },
      externalUrl: null,
    });
    const full = suggestImprovements(signals, { category: "oss_author" });
    const fullIds = full.map((s) => s.id);
    expect(fullIds).toContain("tag-release");

    const filtered = suggestImprovements(signals, {
      category: "oss_author",
      dismissedIds: ["tag-release", "add-homepage-url"],
    });
    const filteredIds = filtered.map((s) => s.id);
    expect(filteredIds).not.toContain("tag-release");
    expect(filteredIds).not.toContain("add-homepage-url");
    expect(filteredIds.length).toBe(fullIds.length - 2);
  });

  it("every suggestion in SUGGESTION_CONTENT has an effort tag", () => {
    for (const entry of Object.values(SUGGESTION_CONTENT)) {
      expect(["5min", "30min", "1h+"]).toContain(entry.effort);
    }
  });

  it("every suggestion advertises at least one category", () => {
    for (const entry of Object.values(SUGGESTION_CONTENT)) {
      expect(entry.categories.length).toBeGreaterThan(0);
    }
  });
});

// ─── aggregateSuggestions ─────────────────────────────────────────────────

describe("aggregateSuggestions", () => {
  it("flattens per-project suggestions and orders by effort (5min first)", () => {
    const weak = baseSignals({
      commitActivity: { status: "ok", activeDayCount: 1, totalWeeks: 52 },
      commitMessages: {
        status: "ok",
        total: 1,
        meaningfulCount: 0,
        sample: ["wip"],
      },
      releases: { status: "missing" },
      externalUrl: null,
      recency: {
        status: "ok",
        createdAt: isoDaysAgo(3),
        lastPushedAt: isoDaysAgo(1),
      },
    });

    const aggregated = aggregateSuggestions([
      {
        projectId: "p1",
        projectName: "alpha",
        signals: weak,
        category: "oss_author",
        dismissedIds: [],
      },
      {
        projectId: "p2",
        projectName: "beta",
        signals: weak,
        category: "personal_learning",
        dismissedIds: [],
      },
    ]);

    // Personal_learning emits only 1 (commit-messages-descriptive);
    // oss_author emits several. Aggregate must contain both.
    expect(aggregated.length).toBeGreaterThan(1);
    // Every entry has a project id
    for (const s of aggregated) {
      expect(s.projectId).toMatch(/^p[12]$/);
    }
    // 5min effort entries come first
    const effortSeq = aggregated.map((s) => s.effort);
    const first5min = effortSeq.indexOf("5min");
    const first1h = effortSeq.indexOf("1h+");
    if (first5min !== -1 && first1h !== -1) {
      expect(first5min).toBeLessThan(first1h);
    }
  });

  it("respects per-project dismissals", () => {
    const weak = baseSignals({
      commitActivity: { status: "ok", activeDayCount: 1, totalWeeks: 52 },
      releases: { status: "missing" },
    });
    const aggregated = aggregateSuggestions([
      {
        projectId: "p1",
        projectName: "alpha",
        signals: weak,
        category: "oss_author",
        dismissedIds: ["tag-release"],
      },
    ]);
    expect(aggregated.find((s) => s.id === "tag-release")).toBeUndefined();
  });
});
