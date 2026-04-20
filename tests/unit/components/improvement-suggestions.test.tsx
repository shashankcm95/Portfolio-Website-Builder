// Phase 5.2 — the Ask Assistant dialog imports `react-markdown` (ESM-only),
// which next/jest doesn't transform by default. This test exercises the
// suggestion list, not the dialog itself — stub it so the import chain
// stays CJS-friendly.
jest.mock("@/components/chatbot/ask-assistant-dialog", () => ({
  AskAssistantDialog: () => null,
}));

import { render, screen } from "@testing-library/react";
import { ImprovementSuggestions } from "@/components/github/improvement-suggestions";
import { scoreAuthorship } from "@/lib/credibility/authorship";
import {
  CREDIBILITY_SCHEMA_VERSION,
  type CredibilitySignals,
} from "@/lib/credibility/types";

const DAY = 1000 * 60 * 60 * 24;
const now = Date.now();
const isoDaysAgo = (n: number) => new Date(now - n * DAY).toISOString();

function makeSignals(
  overrides: Partial<CredibilitySignals> = {}
): CredibilitySignals {
  const partial: Omit<CredibilitySignals, "authorshipSignal"> = {
    schemaVersion: CREDIBILITY_SCHEMA_VERSION,
    ci: { status: "missing" },
    recency: {
      status: "ok",
      createdAt: isoDaysAgo(10),
      lastPushedAt: isoDaysAgo(1),
    },
    releases: { status: "missing" },
    workflows: { status: "missing" },
    languages: { status: "error" },
    topics: { status: "missing" },
    commits: {
      status: "ok",
      total: 1,
      firstAt: isoDaysAgo(1),
      lastAt: isoDaysAgo(1),
    },
    contributors: { status: "ok", count: 1 },
    issuesAndPRs: { status: "ok", closedTotal: 0 },
    testFramework: { status: "missing" },
    verifiedStack: { status: "missing" },
    commitActivity: { status: "ok", activeDayCount: 1, totalWeeks: 52 },
    commitMessages: {
      status: "ok",
      total: 1,
      meaningfulCount: 0,
      sample: ["initial commit"],
    },
    externalUrl: null,
    ...overrides,
  };
  return {
    ...partial,
    authorshipSignal: scoreAuthorship(partial as CredibilitySignals),
  };
}

describe("<ImprovementSuggestions />", () => {
  it("returns null when signals is null", () => {
    const { container } = render(<ImprovementSuggestions signals={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null when there are no suggestions (green repo)", () => {
    const signals = makeSignals({
      commitActivity: { status: "ok", activeDayCount: 100, totalWeeks: 52 },
      commitMessages: {
        status: "ok",
        total: 30,
        meaningfulCount: 28,
        sample: [],
      },
      contributors: { status: "ok", count: 5 },
      issuesAndPRs: { status: "ok", closedTotal: 30 },
      releases: {
        status: "ok",
        count: 5,
        latestTag: "v1",
        latestAt: isoDaysAgo(1),
      },
      externalUrl: "https://example.com",
      recency: {
        status: "ok",
        createdAt: isoDaysAgo(365),
        lastPushedAt: isoDaysAgo(1),
      },
    });
    const { container } = render(<ImprovementSuggestions signals={signals} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders suggestion rows for an AI-dump-shape repo", () => {
    const signals = makeSignals();
    render(<ImprovementSuggestions signals={signals} />);
    expect(screen.getByTestId("improvement-suggestions")).toBeInTheDocument();
    // Expect suggestions for commit cadence, messages, PRs, releases, homepage
    expect(
      screen.getByText(/Spread development across more days/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Write descriptive commit messages/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Use pull requests, even on solo projects/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Tag a release/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Add a homepage URL to the repo/i)
    ).toBeInTheDocument();
  });

  it("each row has a disabled 'Ask the assistant' button", () => {
    const signals = makeSignals();
    render(<ImprovementSuggestions signals={signals} />);
    const buttons = screen.getAllByRole("button", {
      name: /ask the assistant/i,
    });
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((b) => {
      expect(b).toBeDisabled();
    });
  });

  it("renders the impact badge appropriate to each suggestion", () => {
    const signals = makeSignals();
    render(<ImprovementSuggestions signals={signals} />);
    // AI-dump-shape produces at least one negative-to-positive
    expect(screen.getAllByText(/\+1 positive factor/i).length).toBeGreaterThan(
      0
    );
  });

  it("links to help docs when a suggestion has a helpUrl", () => {
    const signals = makeSignals();
    render(<ImprovementSuggestions signals={signals} />);
    const links = screen.getAllByText(/Read the docs/i);
    expect(links.length).toBeGreaterThan(0);
    // Each link should be an external anchor
    for (const link of links) {
      const anchor = link.closest("a");
      expect(anchor).toHaveAttribute("target", "_blank");
    }
  });
});
