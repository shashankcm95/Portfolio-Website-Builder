import {
  CATEGORY_THRESHOLDS,
  classifyRepoCategory,
} from "@/lib/credibility/category";
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

function bundle(
  overrides: Partial<CredibilitySignals> = {}
): CredibilitySignals {
  return {
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
      firstAt: isoDaysAgo(300),
      lastAt: isoDaysAgo(10),
    },
    contributors: { status: "ok", count: 1 },
    issuesAndPRs: { status: "ok", closedTotal: 0 },
    testFramework: { status: "missing" },
    verifiedStack: { status: "missing" },
    commitActivity: { status: "missing" },
    commitMessages: { status: "error" },
    externalUrl: null,
    authorshipSignal: { status: "missing", reason: "n/a" },
    ...overrides,
  };
}

// ─── Classifier ─────────────────────────────────────────────────────────────

describe("classifyRepoCategory", () => {
  it("returns unspecified when login or owner is missing", () => {
    expect(classifyRepoCategory(bundle(), null, "acme", 0)).toBe("unspecified");
    expect(classifyRepoCategory(bundle(), "alice", null, 0)).toBe(
      "unspecified"
    );
    expect(classifyRepoCategory(bundle(), "", "", 0)).toBe("unspecified");
  });

  it("returns oss_contributor when owner differs from user login", () => {
    expect(classifyRepoCategory(bundle(), "alice", "bob", 0)).toBe(
      "oss_contributor"
    );
    // Case-insensitive comparison
    expect(classifyRepoCategory(bundle(), "Alice", "alice", 0)).not.toBe(
      "oss_contributor"
    );
  });

  it("returns oss_author when user owns a repo with ≥3 contributors", () => {
    const s = bundle({
      contributors: {
        status: "ok",
        count: CATEGORY_THRESHOLDS.OSS_CONTRIBUTORS_MIN,
      },
    });
    expect(classifyRepoCategory(s, "alice", "alice", 0)).toBe("oss_author");
  });

  it("returns oss_author when user owns a repo with ≥10 stars regardless of contributors", () => {
    const s = bundle({ contributors: { status: "ok", count: 1 } });
    expect(
      classifyRepoCategory(s, "alice", "alice", CATEGORY_THRESHOLDS.OSS_STARS_MIN)
    ).toBe("oss_author");
  });

  it("returns personal_tool for sustained solo work (≥10 active days AND ≥60d old)", () => {
    const s = bundle({
      recency: {
        status: "ok",
        createdAt: isoDaysAgo(CATEGORY_THRESHOLDS.TOOL_AGE_DAYS_MIN + 10),
        lastPushedAt: isoDaysAgo(3),
      },
      commitActivity: {
        status: "ok",
        activeDayCount: CATEGORY_THRESHOLDS.TOOL_ACTIVE_DAYS_MIN,
        totalWeeks: 52,
      },
    });
    expect(classifyRepoCategory(s, "alice", "alice", 0)).toBe("personal_tool");
  });

  it("does NOT call solo sparse work a personal_tool (young repo)", () => {
    const s = bundle({
      recency: {
        status: "ok",
        createdAt: isoDaysAgo(7),
        lastPushedAt: isoDaysAgo(1),
      },
      commitActivity: {
        status: "ok",
        activeDayCount: 20, // active but young
        totalWeeks: 1,
      },
    });
    expect(classifyRepoCategory(s, "alice", "alice", 0)).toBe(
      "personal_learning"
    );
  });

  it("falls back to personal_learning for short-lived solo repos", () => {
    const s = bundle({
      recency: {
        status: "ok",
        createdAt: isoDaysAgo(10),
        lastPushedAt: isoDaysAgo(1),
      },
      commitActivity: { status: "ok", activeDayCount: 3, totalWeeks: 2 },
      contributors: { status: "ok", count: 1 },
    });
    expect(classifyRepoCategory(s, "alice", "alice", 0)).toBe(
      "personal_learning"
    );
  });

  it("handles zero / missing stars as zero", () => {
    const s = bundle();
    expect(classifyRepoCategory(s, "alice", "alice", undefined)).toBe(
      "personal_learning"
    );
    expect(classifyRepoCategory(s, "alice", "alice", null)).toBe(
      "personal_learning"
    );
  });

  it("handles missing commitActivity / recency gracefully", () => {
    const s = bundle({
      commitActivity: { status: "error" },
      recency: { status: "error" },
      contributors: { status: "error" },
    });
    // Falls through to personal_learning — no positive signals for tool/author.
    expect(classifyRepoCategory(s, "alice", "alice", 0)).toBe(
      "personal_learning"
    );
  });

  it("prefers oss_contributor over all other branches when owner differs", () => {
    // Even with high contributors + stars, owner mismatch wins.
    const s = bundle({ contributors: { status: "ok", count: 50 } });
    expect(classifyRepoCategory(s, "alice", "bob", 5000)).toBe(
      "oss_contributor"
    );
  });
});
