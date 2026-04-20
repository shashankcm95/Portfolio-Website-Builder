import {
  classifyCommitMessage,
  resolveExternalUrl,
  scoreAuthorship,
  STOP_LIST,
  THRESHOLDS,
} from "@/lib/credibility/authorship";
import {
  CREDIBILITY_SCHEMA_VERSION,
  type CredibilitySignals,
} from "@/lib/credibility/types";

// ─── Test helpers ───────────────────────────────────────────────────────────

const DAY = 1000 * 60 * 60 * 24;
const now = Date.now();

function isoDaysAgo(days: number): string {
  return new Date(now - days * DAY).toISOString();
}

function makeSignals(overrides: Partial<CredibilitySignals> = {}): CredibilitySignals {
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
      total: 50,
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

// ─── classifyCommitMessage ──────────────────────────────────────────────────

describe("classifyCommitMessage", () => {
  it("rejects messages ≤ 20 chars", () => {
    expect(classifyCommitMessage("fix")).toBe(false);
    expect(classifyCommitMessage("Short message")).toBe(false);
    expect(classifyCommitMessage("exactly twenty chars")).toBe(false);
  });

  it("accepts descriptive messages > 20 chars", () => {
    expect(
      classifyCommitMessage("Add JWT middleware to auth routes")
    ).toBe(true);
    expect(
      classifyCommitMessage("Refactor user dashboard for new pricing page")
    ).toBe(true);
  });

  it("rejects stop-listed single-token messages even if padded", () => {
    expect(classifyCommitMessage("fix")).toBe(false);
    expect(classifyCommitMessage("wip")).toBe(false);
    expect(classifyCommitMessage("initial commit")).toBe(false);
  });

  it("takes first line only for multiline messages", () => {
    const msg = "Add auth middleware\n\nThis is the body with more detail";
    expect(classifyCommitMessage(msg)).toBe(false);
    // First line is only 20 chars (+ trimmed "Add auth middleware" = 19)
    const longFirstLine =
      "Add JWT middleware to auth routes\n\nLong body text here";
    expect(classifyCommitMessage(longFirstLine)).toBe(true);
  });

  it("accepts Conventional Commits summary format", () => {
    expect(
      classifyCommitMessage("feat(auth): add refresh-token rotation")
    ).toBe(true);
    expect(
      classifyCommitMessage("chore(deps): bump drizzle-orm to 0.39")
    ).toBe(true);
    expect(
      classifyCommitMessage("refactor: split pipeline orchestrator")
    ).toBe(true);
  });

  it("rejects messages starting with a digit (bare version tags)", () => {
    expect(classifyCommitMessage("1.0.0")).toBe(false);
    expect(classifyCommitMessage("2024-04-19 end-of-day")).toBe(false);
  });

  it("exposes STOP_LIST for auditing", () => {
    expect(STOP_LIST.has("fix")).toBe(true);
    expect(STOP_LIST.has("initial commit")).toBe(true);
  });
});

// ─── scoreAuthorship — canonical cases A–D ──────────────────────────────────

describe("scoreAuthorship — canonical cases", () => {
  it("Case A — AI dump: all negatives → single-burst (red)", () => {
    const signals = makeSignals({
      commits: {
        status: "ok",
        total: 1,
        firstAt: isoDaysAgo(1),
        lastAt: isoDaysAgo(1),
      },
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
    const result = scoreAuthorship(signals);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.verdict).toBe("single-burst");
    expect(result.positiveCount).toBe(0);
  });

  it("Case B — Private→launch: 2 positives (releases + external) → mixed", () => {
    const signals = makeSignals({
      commits: {
        status: "ok",
        total: 1,
        firstAt: isoDaysAgo(1),
        lastAt: isoDaysAgo(1),
      },
      commitActivity: { status: "ok", activeDayCount: 1, totalWeeks: 52 },
      commitMessages: {
        status: "ok",
        total: 1,
        meaningfulCount: 1,
        sample: ["v1.0.0 — initial public launch of portfolio builder"],
      },
      contributors: { status: "ok", count: 1 },
      issuesAndPRs: { status: "ok", closedTotal: 0 },
      releases: {
        status: "ok",
        count: 1,
        latestTag: "v1.0.0",
        latestAt: isoDaysAgo(1),
      },
      externalUrl: "https://example.com",
      recency: {
        status: "ok",
        createdAt: isoDaysAgo(1),
        lastPushedAt: isoDaysAgo(1),
      },
    });
    const result = scoreAuthorship(signals);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.verdict).toBe("mixed");
    expect(result.positiveCount).toBe(2);
  });

  it("Case C — Solo hobby: 15 active days, decent msgs, no PRs/releases → mixed", () => {
    const signals = makeSignals({
      commits: {
        status: "ok",
        total: 15,
        firstAt: isoDaysAgo(90),
        lastAt: isoDaysAgo(5),
      },
      commitActivity: { status: "ok", activeDayCount: 12, totalWeeks: 52 },
      commitMessages: {
        status: "ok",
        total: 15,
        meaningfulCount: 12,
        sample: ["Add feature X", "Refactor auth", "Update docs for new API"],
      },
      contributors: { status: "ok", count: 1 },
      issuesAndPRs: { status: "ok", closedTotal: 0 },
      releases: { status: "missing" },
      externalUrl: null,
      recency: {
        status: "ok",
        createdAt: isoDaysAgo(90),
        lastPushedAt: isoDaysAgo(5),
      },
    });
    const result = scoreAuthorship(signals);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    // positives: messageQuality, ageVsPush = 2 → mixed (not sustained)
    expect(result.verdict).toBe("mixed");
    expect(result.positiveCount).toBe(2);
  });

  it("Case D — Mature collab: all positives → sustained (green)", () => {
    const signals = makeSignals({
      commits: {
        status: "ok",
        total: 500,
        firstAt: isoDaysAgo(730),
        lastAt: isoDaysAgo(1),
      },
      commitActivity: { status: "ok", activeDayCount: 180, totalWeeks: 52 },
      commitMessages: {
        status: "ok",
        total: 30,
        meaningfulCount: 25,
        sample: ["Add user dashboard", "Refactor payment module"],
      },
      contributors: { status: "ok", count: 8 },
      issuesAndPRs: { status: "ok", closedTotal: 200 },
      releases: {
        status: "ok",
        count: 15,
        latestTag: "v2.3.0",
        latestAt: isoDaysAgo(30),
      },
      externalUrl: "https://example.com",
      recency: {
        status: "ok",
        createdAt: isoDaysAgo(730),
        lastPushedAt: isoDaysAgo(1),
      },
    });
    const result = scoreAuthorship(signals);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.verdict).toBe("sustained");
    expect(result.positiveCount).toBe(6);
  });
});

// ─── Per-factor boundary checks ─────────────────────────────────────────────

describe("scoreAuthorship — factor boundaries", () => {
  it("commitDays: 20 → positive; 19 → neutral; 4 → negative", () => {
    const atPositive = scoreAuthorship(
      makeSignals({
        commitActivity: { status: "ok", activeDayCount: 20, totalWeeks: 52 },
      })
    );
    const atNeutralTop = scoreAuthorship(
      makeSignals({
        commitActivity: { status: "ok", activeDayCount: 19, totalWeeks: 52 },
      })
    );
    const atNegativeTop = scoreAuthorship(
      makeSignals({
        commitActivity: { status: "ok", activeDayCount: 4, totalWeeks: 52 },
      })
    );

    expect(factor(atPositive, "commitDays")?.verdict).toBe("positive");
    expect(factor(atNeutralTop, "commitDays")?.verdict).toBe("neutral");
    expect(factor(atNegativeTop, "commitDays")?.verdict).toBe("negative");
  });

  it("messageQuality: 0.5 ratio + 5+ total → positive; 0.25 → neutral", () => {
    const positive = scoreAuthorship(
      makeSignals({
        commitMessages: {
          status: "ok",
          total: 10,
          meaningfulCount: 5,
          sample: [],
        },
      })
    );
    const neutral = scoreAuthorship(
      makeSignals({
        commitMessages: {
          status: "ok",
          total: 10,
          meaningfulCount: 3,
          sample: [],
        },
      })
    );
    const negative = scoreAuthorship(
      makeSignals({
        commitMessages: {
          status: "ok",
          total: 10,
          meaningfulCount: 2,
          sample: [],
        },
      })
    );

    expect(factor(positive, "messageQuality")?.verdict).toBe("positive");
    expect(factor(neutral, "messageQuality")?.verdict).toBe("neutral");
    expect(factor(negative, "messageQuality")?.verdict).toBe("negative");
  });

  it("collaboration: PR or contributors≥2 → positive", () => {
    const pr = scoreAuthorship(
      makeSignals({ issuesAndPRs: { status: "ok", closedTotal: 1 } })
    );
    const multiContrib = scoreAuthorship(
      makeSignals({ contributors: { status: "ok", count: 2 } })
    );
    const solo = scoreAuthorship(
      makeSignals({
        contributors: { status: "ok", count: 1 },
        issuesAndPRs: { status: "ok", closedTotal: 0 },
      })
    );

    expect(factor(pr, "collaboration")?.verdict).toBe("positive");
    expect(factor(multiContrib, "collaboration")?.verdict).toBe("positive");
    expect(factor(solo, "collaboration")?.verdict).toBe("negative");
  });

  it("externalPresence: externalUrl non-null → positive", () => {
    const withUrl = scoreAuthorship(
      makeSignals({ externalUrl: "https://example.com" })
    );
    const withoutUrl = scoreAuthorship(makeSignals({ externalUrl: null }));
    expect(factor(withUrl, "externalPresence")?.verdict).toBe("positive");
    expect(factor(withoutUrl, "externalPresence")?.verdict).toBe("negative");
  });

  it("ageVsPush: mature + active → positive; fresh + active → neutral", () => {
    const matureActive = scoreAuthorship(
      makeSignals({
        recency: {
          status: "ok",
          createdAt: isoDaysAgo(30),
          lastPushedAt: isoDaysAgo(10),
        },
      })
    );
    const freshActive = scoreAuthorship(
      makeSignals({
        recency: {
          status: "ok",
          createdAt: isoDaysAgo(5),
          lastPushedAt: isoDaysAgo(1),
        },
      })
    );
    const stale = scoreAuthorship(
      makeSignals({
        recency: {
          status: "ok",
          createdAt: isoDaysAgo(500),
          lastPushedAt: isoDaysAgo(300),
        },
      })
    );
    expect(factor(matureActive, "ageVsPush")?.verdict).toBe("positive");
    expect(factor(freshActive, "ageVsPush")?.verdict).toBe("neutral");
    expect(factor(stale, "ageVsPush")?.verdict).toBe("negative");
  });
});

// ─── Missing fallback ───────────────────────────────────────────────────────

describe("scoreAuthorship — missing fallback", () => {
  it("returns status=missing when all three commit signals failed", () => {
    const signals = makeSignals({
      commits: { status: "error" },
      commitActivity: { status: "error" },
      commitMessages: { status: "error" },
    });
    const result = scoreAuthorship(signals);
    expect(result.status).toBe("missing");
  });

  it("still scores (produces red) when commits=ok but stats are missing", () => {
    const signals = makeSignals({
      commits: {
        status: "ok",
        total: 1,
        firstAt: isoDaysAgo(1),
        lastAt: isoDaysAgo(1),
      },
      commitActivity: { status: "missing" },
      commitMessages: { status: "error" },
    });
    const result = scoreAuthorship(signals);
    expect(result.status).toBe("ok");
  });
});

// ─── resolveExternalUrl ─────────────────────────────────────────────────────

describe("resolveExternalUrl", () => {
  it("returns trimmed homepage when non-empty", () => {
    expect(resolveExternalUrl("https://example.com", "https://github.com/x/y"))
      .toBe("https://example.com");
  });

  it("returns htmlUrl when hosted on a known deploy host", () => {
    expect(
      resolveExternalUrl(null, "https://user.github.io/my-portfolio")
    ).toBe("https://user.github.io/my-portfolio");
    expect(
      resolveExternalUrl("", "https://my-site.vercel.app")
    ).toBe("https://my-site.vercel.app");
  });

  it("returns null when neither homepage nor deploy-host match", () => {
    expect(
      resolveExternalUrl(null, "https://github.com/x/y")
    ).toBeNull();
    expect(
      resolveExternalUrl("", "https://github.com/x/y")
    ).toBeNull();
  });

  it("handles malformed htmlUrl gracefully", () => {
    expect(resolveExternalUrl(null, "not-a-url")).toBeNull();
  });
});

// ─── Threshold exports ──────────────────────────────────────────────────────

describe("THRESHOLDS", () => {
  it("are exposed for auditing", () => {
    expect(THRESHOLDS.COMMIT_DAYS_POSITIVE).toBe(20);
    expect(THRESHOLDS.MSG_QUALITY_POSITIVE_RATIO).toBe(0.5);
  });
});

// ─── Helper ─────────────────────────────────────────────────────────────────

function factor(
  signal: ReturnType<typeof scoreAuthorship>,
  name: string
) {
  if (signal.status !== "ok") return undefined;
  return signal.factors.find((f) => f.name === name);
}
