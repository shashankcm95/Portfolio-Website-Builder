import { generateCharacterization } from "@/lib/credibility/characterization";
import {
  CREDIBILITY_SCHEMA_VERSION,
  type CredibilitySignals,
} from "@/lib/credibility/types";

const DAY = 1000 * 60 * 60 * 24;
const now = Date.now();

function isoDaysAgo(days: number): string {
  return new Date(now - days * DAY).toISOString();
}

function base(): CredibilitySignals {
  return {
    schemaVersion: CREDIBILITY_SCHEMA_VERSION,
    ci: { status: "missing" },
    recency: {
      status: "ok",
      createdAt: isoDaysAgo(120),
      lastPushedAt: isoDaysAgo(5),
    },
    releases: { status: "missing" },
    workflows: { status: "missing" },
    languages: { status: "error" },
    topics: { status: "missing" },
    commits: {
      status: "ok",
      total: 40,
      firstAt: isoDaysAgo(120),
      lastAt: isoDaysAgo(5),
    },
    contributors: { status: "ok", count: 3 },
    issuesAndPRs: { status: "ok", closedTotal: 0 },
    testFramework: { status: "missing" },
    verifiedStack: { status: "missing" },
    commitActivity: { status: "ok", activeDayCount: 18, totalWeeks: 20 },
    commitMessages: {
      status: "ok",
      total: 10,
      meaningfulCount: 7,
      sample: [],
    },
    externalUrl: "https://demo.example.com/app",
    authorshipSignal: { status: "missing", reason: "n/a" },
  };
}

describe("generateCharacterization", () => {
  it("personal_learning mentions age + commits + active days", () => {
    const s = generateCharacterization({
      category: "personal_learning",
      signals: base(),
      repoName: "jwt-playground",
    });
    expect(s).toMatch(/exploratory build/i);
    expect(s).toMatch(/commit/i);
    expect(s).toMatch(/day/i);
    expect(s.endsWith(".")).toBe(true);
  });

  it("personal_tool reports months + active days + deploy host", () => {
    const s = generateCharacterization({
      category: "personal_tool",
      signals: base(),
    });
    expect(s).toMatch(/Solo side project/);
    expect(s).toMatch(/month/i);
    expect(s).toMatch(/active day/i);
    expect(s).toMatch(/demo\.example\.com/);
  });

  it("personal_tool without a deploy URL omits the deploy clause", () => {
    const signals = { ...base(), externalUrl: null };
    const s = generateCharacterization({
      category: "personal_tool",
      signals,
    });
    expect(s).toMatch(/Solo side project/);
    expect(s).not.toMatch(/deployed/);
  });

  it("oss_author reports stars + contributors", () => {
    const s = generateCharacterization({
      category: "oss_author",
      signals: base(),
      stars: 42,
    });
    expect(s).toMatch(/Open-source project/);
    expect(s).toMatch(/42 star/);
    expect(s).toMatch(/3 contributor/);
  });

  it("oss_author includes latest release tag when present", () => {
    const signals = {
      ...base(),
      releases: {
        status: "ok" as const,
        count: 2,
        latestTag: "v1.2.0",
        latestAt: isoDaysAgo(10),
      },
    };
    const s = generateCharacterization({
      category: "oss_author",
      signals,
      stars: 10,
    });
    expect(s).toMatch(/v1\.2\.0/);
  });

  it("oss_contributor frames as contributor to owner/repo", () => {
    const s = generateCharacterization({
      category: "oss_contributor",
      signals: base(),
      repoOwner: "vercel",
      repoName: "next.js",
    });
    expect(s).toMatch(/Contributor to vercel\/next\.js/);
  });

  it("fallback line when category is unspecified and no repo name", () => {
    const s = generateCharacterization({
      category: "unspecified",
      signals: base(),
    });
    expect(s).toBe("GitHub project.");
  });

  it("fallback line uses repo name when provided", () => {
    const s = generateCharacterization({
      category: "unspecified",
      signals: base(),
      repoName: "widgets",
    });
    expect(s).toMatch(/widgets/);
  });

  it("never throws on missing signals", () => {
    const thin: CredibilitySignals = {
      ...base(),
      recency: { status: "error" },
      commits: { status: "error" },
      commitActivity: { status: "error" },
      contributors: { status: "error" },
      externalUrl: null,
    };
    for (const category of [
      "personal_learning",
      "personal_tool",
      "oss_author",
      "oss_contributor",
      "unspecified",
    ] as const) {
      const s = generateCharacterization({
        category,
        signals: thin,
        repoName: "x",
      });
      expect(s.length).toBeGreaterThan(0);
      expect(s.endsWith(".")).toBe(true);
    }
  });

  it("singularizes units correctly", () => {
    const signals = {
      ...base(),
      commits: {
        status: "ok" as const,
        total: 1,
        firstAt: isoDaysAgo(1),
        lastAt: isoDaysAgo(1),
      },
      commitActivity: { status: "ok" as const, activeDayCount: 1, totalWeeks: 1 },
    };
    const s = generateCharacterization({
      category: "personal_learning",
      signals,
    });
    expect(s).toMatch(/1 commit\b/);
    expect(s).toMatch(/1 day\b/);
    expect(s).not.toMatch(/1 commits/);
    expect(s).not.toMatch(/1 days/);
  });
});
