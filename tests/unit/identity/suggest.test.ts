/**
 * @jest-environment node
 *
 * Phase E7 — Tests for the deterministic field suggesters.
 *
 * Positioning + ctaText use the LLM (covered by integration tests in
 * the suggest API route). The deterministic paths
 * (namedEmployers / ctaHref / anchorStat) need no LLM, so we exercise
 * them at the engine level by passing a fake `loadPortfolioContext`
 * via module mocking and asserting the candidates are ranked correctly.
 */

import { suggestField } from "@/lib/identity/suggest/suggest";
import * as contextModule from "@/lib/identity/suggest/context";

jest.mock("@/lib/identity/suggest/context");
const mockLoad = contextModule.loadPortfolioContext as jest.MockedFunction<
  typeof contextModule.loadPortfolioContext
>;

afterEach(() => {
  mockLoad.mockReset();
});

describe("suggestField — namedEmployers", () => {
  it("returns recent employers up to count, in resume order", async () => {
    mockLoad.mockResolvedValue({
      ctx: {
        ownerName: "Test User",
        resumeLabel: null,
        resumeSummary: null,
        recentEmployers: ["Apple", "Klaviyo", "Stripe", "GitHub"],
        topProjects: [],
      },
      userId: "u1",
    });
    const result = await suggestField({
      portfolioId: "p1",
      field: "namedEmployers",
      count: 3,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.response.field).toBe("namedEmployers");
    expect(result.response.suggestions).toEqual(["Apple", "Klaviyo", "Stripe"]);
  });

  it("returns an empty array when no employer history exists", async () => {
    mockLoad.mockResolvedValue({
      ctx: {
        ownerName: "Test User",
        resumeLabel: null,
        resumeSummary: null,
        recentEmployers: [],
        topProjects: [],
      },
      userId: "u1",
    });
    const result = await suggestField({ portfolioId: "p1", field: "namedEmployers" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.response.suggestions).toEqual([]);
  });
});

describe("suggestField — ctaHref", () => {
  it("returns three href candidates including /contact/ and a calendly placeholder", async () => {
    mockLoad.mockResolvedValue({
      ctx: {
        ownerName: "Jane Doe",
        resumeLabel: null,
        resumeSummary: null,
        recentEmployers: [],
        topProjects: [],
      },
      userId: "u1",
    });
    const result = await suggestField({ portfolioId: "p1", field: "ctaHref" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    const sugg = result.response.suggestions as string[];
    expect(sugg).toHaveLength(3);
    expect(sugg).toContain("/contact/");
    expect(sugg.some((s) => s.startsWith("https://calendly.com/jane-doe"))).toBe(true);
    expect(sugg.some((s) => s.startsWith("mailto:jane-doe@"))).toBe(true);
  });

  it("falls back to a generic slug when the owner has no name", async () => {
    mockLoad.mockResolvedValue({
      ctx: {
        ownerName: "  ",
        resumeLabel: null,
        resumeSummary: null,
        recentEmployers: [],
        topProjects: [],
      },
      userId: "u1",
    });
    const result = await suggestField({ portfolioId: "p1", field: "ctaHref" });
    if (!result.ok) throw new Error("expected ok");
    const sugg = result.response.suggestions as string[];
    expect(sugg.some((s) => s.includes("your-handle"))).toBe(true);
  });
});

describe("suggestField — anchorStat", () => {
  it("ranks outcomes above employer-based candidates", async () => {
    mockLoad.mockResolvedValue({
      ctx: {
        ownerName: "Jane Doe",
        resumeLabel: null,
        resumeSummary: null,
        recentEmployers: ["Apple", "Klaviyo"],
        topProjects: [
          {
            name: "Signal Forge",
            description: null,
            techStack: [],
            outcomes: [
              { metric: "GitHub stars", value: "4.2k" },
              { metric: "Active users", value: "500" },
            ],
          },
        ],
      },
      userId: "u1",
    });
    const result = await suggestField({
      portfolioId: "p1",
      field: "anchorStat",
      count: 3,
    });
    if (!result.ok) throw new Error("expected ok");
    expect(result.response.field).toBe("anchorStat");
    const sugg = result.response.suggestions;
    expect(sugg.length).toBe(3);
    expect(sugg[0]).toMatchObject({ value: "4.2k", unit: "GitHub stars" });
    expect(sugg[1]).toMatchObject({ value: "500", unit: "Active users" });
    expect(sugg[2]).toMatchObject({ value: "Previously at" });
  });

  it("falls back to employer candidate when no outcomes exist", async () => {
    mockLoad.mockResolvedValue({
      ctx: {
        ownerName: "Jane Doe",
        resumeLabel: null,
        resumeSummary: null,
        recentEmployers: ["Apple"],
        topProjects: [
          {
            name: "x",
            description: null,
            techStack: [],
            outcomes: [],
          },
        ],
      },
      userId: "u1",
    });
    const result = await suggestField({ portfolioId: "p1", field: "anchorStat" });
    if (!result.ok) throw new Error("expected ok");
    expect(result.response.suggestions).toHaveLength(1);
    expect(result.response.suggestions[0]).toMatchObject({
      value: "Previously at",
      unit: "Apple",
    });
  });

  it("returns an empty array when nothing rankable exists", async () => {
    mockLoad.mockResolvedValue({
      ctx: {
        ownerName: "x",
        resumeLabel: null,
        resumeSummary: null,
        recentEmployers: [],
        topProjects: [],
      },
      userId: "u1",
    });
    const result = await suggestField({ portfolioId: "p1", field: "anchorStat" });
    if (!result.ok) throw new Error("expected ok");
    expect(result.response.suggestions).toEqual([]);
  });

  it("strips the internal `score` field before returning", async () => {
    mockLoad.mockResolvedValue({
      ctx: {
        ownerName: "x",
        resumeLabel: null,
        resumeSummary: null,
        recentEmployers: ["A"],
        topProjects: [],
      },
      userId: "u1",
    });
    const result = await suggestField({ portfolioId: "p1", field: "anchorStat" });
    if (!result.ok) throw new Error("expected ok");
    const first = result.response.suggestions[0] as Record<string, unknown>;
    expect(first.score).toBeUndefined();
  });
});

describe("suggestField — error paths", () => {
  it("returns 404 when the portfolio does not exist", async () => {
    mockLoad.mockResolvedValue(null);
    const result = await suggestField({ portfolioId: "missing", field: "namedEmployers" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error");
    expect(result.status).toBe(404);
    expect(result.code).toBe("not_found");
  });
});
