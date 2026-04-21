import {
  rubricFactorNames,
  scoreWithRubric,
} from "@/lib/credibility/rubrics";
import {
  CREDIBILITY_SCHEMA_VERSION,
  type CredibilitySignals,
} from "@/lib/credibility/types";

// ─── Helpers ────────────────────────────────────────────────────────────────

const DAY = 1000 * 60 * 60 * 24;
const now = Date.now();

function isoDaysAgo(days: number): string {
  return new Date(now - days * DAY).toISOString();
}

/** Strong signals across the board — every sub-scorer returns positive. */
function strongSignals(): CredibilitySignals {
  return {
    schemaVersion: CREDIBILITY_SCHEMA_VERSION,
    ci: { status: "missing" },
    recency: {
      status: "ok",
      createdAt: isoDaysAgo(200),
      lastPushedAt: isoDaysAgo(3),
    },
    releases: { status: "ok", count: 3, latestTag: "v1.0", latestAt: isoDaysAgo(20) },
    workflows: { status: "missing" },
    languages: { status: "error" },
    topics: { status: "missing" },
    commits: {
      status: "ok",
      total: 50,
      firstAt: isoDaysAgo(180),
      lastAt: isoDaysAgo(3),
    },
    contributors: { status: "ok", count: 5 },
    issuesAndPRs: { status: "ok", closedTotal: 12 },
    testFramework: { status: "missing" },
    verifiedStack: { status: "missing" },
    commitActivity: { status: "ok", activeDayCount: 40, totalWeeks: 26 },
    commitMessages: {
      status: "ok",
      total: 10,
      meaningfulCount: 8,
      sample: [],
    },
    externalUrl: "https://example.com",
    authorshipSignal: { status: "missing", reason: "n/a" },
  };
}

/** Weak signals — nothing scores positive. */
function weakSignals(): CredibilitySignals {
  return {
    ...strongSignals(),
    recency: {
      status: "ok",
      createdAt: isoDaysAgo(3),
      lastPushedAt: isoDaysAgo(1),
    },
    releases: { status: "missing" },
    contributors: { status: "ok", count: 1 },
    issuesAndPRs: { status: "ok", closedTotal: 0 },
    commitActivity: { status: "ok", activeDayCount: 2, totalWeeks: 1 },
    commitMessages: {
      status: "ok",
      total: 10,
      meaningfulCount: 0,
      sample: [],
    },
    externalUrl: null,
  };
}

// ─── Rubric shape ───────────────────────────────────────────────────────────

describe("scoreWithRubric — personal_learning", () => {
  it("only evaluates messageQuality", () => {
    const { affirmations, gaps } = scoreWithRubric(
      strongSignals(),
      "personal_learning"
    );
    const names = [...affirmations, ...gaps].map((f) => f.name);
    expect(names).toEqual(["messageQuality"]);
  });

  it("a strong learning repo puts messageQuality in affirmations", () => {
    const { affirmations, gaps } = scoreWithRubric(
      strongSignals(),
      "personal_learning"
    );
    expect(affirmations).toHaveLength(1);
    expect(gaps).toHaveLength(0);
  });

  it("a weak learning repo puts messageQuality in gaps", () => {
    const { affirmations, gaps } = scoreWithRubric(
      weakSignals(),
      "personal_learning"
    );
    expect(affirmations).toHaveLength(0);
    expect(gaps).toHaveLength(1);
  });
});

describe("scoreWithRubric — personal_tool", () => {
  it("hides collaboration for a solo (1 contributor) repo", () => {
    const { affirmations, gaps } = scoreWithRubric(
      strongSignals(),
      "personal_tool"
    );
    const names = [...affirmations, ...gaps].map((f) => f.name);
    // With contributors = 5 (strong), collaboration would appear — use
    // a solo-but-otherwise-strong bundle:
    const solo = { ...strongSignals(), contributors: { status: "ok" as const, count: 1 } };
    const { affirmations: a2, gaps: g2 } = scoreWithRubric(solo, "personal_tool");
    const names2 = [...a2, ...g2].map((f) => f.name);
    expect(names2).not.toContain("collaboration");
    // sanity: includes the tool factors
    expect(names2).toEqual(
      expect.arrayContaining(["messageQuality", "commitDays", "ageVsPush", "externalPresence"])
    );
  });

  it("includes collaboration when contributors > 1", () => {
    const { affirmations, gaps } = scoreWithRubric(
      strongSignals(),
      "personal_tool"
    );
    const names = [...affirmations, ...gaps].map((f) => f.name);
    expect(names).toContain("collaboration");
  });

  it("suppresses releases when not positive (positiveOnly)", () => {
    const { affirmations, gaps } = scoreWithRubric(
      weakSignals(),
      "personal_tool"
    );
    const names = [...affirmations, ...gaps].map((f) => f.name);
    // releases.count = 0 → not positive → should be suppressed entirely
    expect(names).not.toContain("releases");
  });

  it("surfaces releases in affirmations when positive", () => {
    const { affirmations } = scoreWithRubric(
      strongSignals(),
      "personal_tool"
    );
    const names = affirmations.map((f) => f.name);
    expect(names).toContain("releases");
  });
});

describe("scoreWithRubric — oss_author", () => {
  it("evaluates all 6 factors", () => {
    const { affirmations, gaps } = scoreWithRubric(
      strongSignals(),
      "oss_author"
    );
    const names = [...affirmations, ...gaps].map((f) => f.name).sort();
    expect(names).toEqual(
      [
        "ageVsPush",
        "collaboration",
        "commitDays",
        "externalPresence",
        "messageQuality",
        "releases",
      ].sort()
    );
  });
});

describe("scoreWithRubric — oss_contributor", () => {
  it("evaluates messageQuality + collaboration only", () => {
    const { affirmations, gaps } = scoreWithRubric(
      strongSignals(),
      "oss_contributor"
    );
    const names = [...affirmations, ...gaps].map((f) => f.name).sort();
    expect(names).toEqual(["collaboration", "messageQuality"]);
  });

  it("reframes collaboration reason to contributor voice", () => {
    const { affirmations, gaps } = scoreWithRubric(
      strongSignals(),
      "oss_contributor"
    );
    const collab = [...affirmations, ...gaps].find((f) => f.name === "collaboration");
    expect(collab?.reason).toMatch(/contributed/i);
  });
});

describe("scoreWithRubric — unspecified falls back to full rubric", () => {
  it("evaluates all 6 factors", () => {
    const { affirmations, gaps } = scoreWithRubric(
      strongSignals(),
      "unspecified"
    );
    const names = [...affirmations, ...gaps].map((f) => f.name);
    expect(names).toHaveLength(6);
  });
});

describe("rubricFactorNames", () => {
  it("returns only messageQuality for personal_learning", () => {
    expect(rubricFactorNames("personal_learning")).toEqual(["messageQuality"]);
  });
});
