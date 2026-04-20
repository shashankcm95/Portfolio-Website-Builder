import {
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
});
