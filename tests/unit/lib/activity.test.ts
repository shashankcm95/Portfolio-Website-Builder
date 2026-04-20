import {
  deploymentEvents,
  formatRelativeTime,
  mergeActivity,
  portfolioEvents,
  projectEvents,
  type ActivityEvent,
} from "@/lib/activity";

// ─── Fixed reference time for deterministic comparisons ─────────────────────
const NOW = new Date("2026-04-14T12:00:00.000Z");
const iso = (offsetMs: number) =>
  new Date(NOW.getTime() + offsetMs).toISOString();

describe("formatRelativeTime", () => {
  it("returns 'just now' for < 60s", () => {
    expect(formatRelativeTime(iso(-30_000), NOW)).toBe("just now");
  });

  it("rounds minutes correctly", () => {
    expect(formatRelativeTime(iso(-5 * 60_000), NOW)).toBe("5m ago");
  });

  it("falls back to hours after 60 minutes", () => {
    expect(formatRelativeTime(iso(-3 * 3_600_000), NOW)).toBe("3h ago");
  });

  it("falls back to days after 24 hours", () => {
    expect(formatRelativeTime(iso(-2 * 86_400_000), NOW)).toBe("2d ago");
  });

  it("falls back to toLocaleDateString past 30 days", () => {
    const out = formatRelativeTime(iso(-45 * 86_400_000), NOW);
    // Shape matters more than locale here — should not be "Xd ago"
    expect(out).not.toMatch(/d ago$/);
  });

  it("treats future timestamps as 'just now' (clock skew guard)", () => {
    expect(formatRelativeTime(iso(10_000), NOW)).toBe("just now");
  });
});

describe("portfolioEvents", () => {
  it("builds a portfolio_created event per row", () => {
    const rows = [
      { id: "p1", name: "First", createdAt: iso(-1000) },
      { id: "p2", name: "Second", createdAt: iso(-2000) },
    ];
    const events = portfolioEvents(rows);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "portfolio_created",
      title: 'Created portfolio "First"',
      href: "/portfolios/p1",
      portfolioId: "p1",
    });
  });

  it("skips rows without createdAt", () => {
    const events = portfolioEvents([
      { id: "p1", name: "Orphan", createdAt: null },
    ]);
    expect(events).toHaveLength(0);
  });

  it("produces deterministic, unique ids", () => {
    const events = portfolioEvents([
      { id: "abc", name: "x", createdAt: iso(0) },
    ]);
    expect(events[0].id).toBe("pf_created:abc");
  });
});

describe("projectEvents", () => {
  const base = {
    id: "pr1",
    portfolioId: "p1",
    displayName: null,
    repoName: "demo",
    createdAt: iso(-1000),
    lastAnalyzed: null as Date | string | null,
    pipelineStatus: "pending" as string | null,
  };

  it("emits a project_added event for every project", () => {
    const events = projectEvents([{ ...base }]);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "project_added",
        title: "Added project demo",
      })
    );
  });

  it("emits a project_analyzed event only when pipeline is complete", () => {
    const analyzed = {
      ...base,
      lastAnalyzed: iso(-500),
      pipelineStatus: "complete",
    };
    const events = projectEvents([analyzed]);
    const analyzedEvent = events.find((e) => e.type === "project_analyzed");
    expect(analyzedEvent).toBeDefined();
    expect(analyzedEvent?.description).toBe("Pipeline completed");
  });

  it("does NOT emit project_analyzed when pipeline failed", () => {
    const failed = {
      ...base,
      lastAnalyzed: iso(-500),
      pipelineStatus: "failed",
    };
    const events = projectEvents([failed]);
    expect(events.some((e) => e.type === "project_analyzed")).toBe(false);
  });

  it("prefers displayName over repoName in labels", () => {
    const events = projectEvents([
      { ...base, displayName: "My Pretty Name" },
    ]);
    expect(events[0].title).toContain("My Pretty Name");
  });

  it("falls back to 'project' when both labels are null", () => {
    const events = projectEvents([
      { ...base, displayName: null, repoName: null },
    ]);
    expect(events[0].title).toBe("Added project project");
  });
});

describe("deploymentEvents", () => {
  it("maps status 'active' to deployment_live", () => {
    const events = deploymentEvents([
      {
        id: "d1",
        portfolioId: "p1",
        status: "active",
        url: "https://x.pages.dev",
        createdAt: iso(-100),
        deployedAt: iso(-50),
      },
    ]);
    expect(events[0].type).toBe("deployment_live");
    expect(events[0].description).toBe("https://x.pages.dev");
  });

  it("maps status 'failed' to deployment_failed", () => {
    const events = deploymentEvents([
      {
        id: "d1",
        portfolioId: "p1",
        status: "failed",
        url: null,
        createdAt: iso(-100),
        deployedAt: null,
      },
    ]);
    expect(events[0].type).toBe("deployment_failed");
    expect(events[0].title).toBe("Deployment failed");
  });

  it("prefers deployedAt over createdAt for occurredAt", () => {
    const [e] = deploymentEvents([
      {
        id: "d1",
        portfolioId: "p1",
        status: "active",
        url: null,
        createdAt: iso(-100),
        deployedAt: iso(-50),
      },
    ]);
    expect(e.occurredAt).toBe(iso(-50));
  });
});

describe("mergeActivity", () => {
  const event = (id: string, occurredAt: string): ActivityEvent => ({
    id,
    type: "portfolio_created",
    title: id,
    description: null,
    href: null,
    portfolioId: null,
    projectId: null,
    occurredAt,
  });

  it("sorts descending by occurredAt", () => {
    const out = mergeActivity([
      event("a", iso(-3000)),
      event("b", iso(-1000)),
      event("c", iso(-2000)),
    ]);
    expect(out.map((e) => e.id)).toEqual(["b", "c", "a"]);
  });

  it("respects the limit", () => {
    const events = Array.from({ length: 20 }, (_, i) =>
      event(`e${i}`, iso(-i * 1000))
    );
    expect(mergeActivity(events, 5)).toHaveLength(5);
  });

  it("does not mutate the input array", () => {
    const original = [event("a", iso(-1)), event("b", iso(-2))];
    const snapshot = original.map((e) => e.id);
    mergeActivity(original);
    expect(original.map((e) => e.id)).toEqual(snapshot);
  });
});
