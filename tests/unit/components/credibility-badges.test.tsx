import { render, screen } from "@testing-library/react";
import { CredibilityBadges } from "@/components/github/credibility-badges";
import {
  CREDIBILITY_SCHEMA_VERSION,
  type CredibilitySignals,
} from "@/lib/credibility/types";

const okSignals: CredibilitySignals = {
  schemaVersion: CREDIBILITY_SCHEMA_VERSION,
  ci: {
    status: "ok",
    conclusion: "success",
    runUrl: "https://github.com/acme/demo/actions/runs/1",
    runAt: new Date("2026-04-10T10:00:00Z").toISOString(),
  },
  recency: {
    status: "ok",
    createdAt: new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString(),
    lastPushedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  releases: {
    status: "ok",
    count: 12,
    latestTag: "v1.2.0",
    latestAt: "2026-03-01T00:00:00Z",
  },
  workflows: {
    status: "ok",
    total: 3,
    categories: { test: 1, deploy: 1, lint: 1, security: 0, release: 0, other: 0 },
  },
  languages: {
    status: "ok",
    breakdown: [
      { name: "TypeScript", bytes: 9000, pct: 80 },
      { name: "CSS", bytes: 2000, pct: 20 },
    ],
  },
  topics: { status: "ok", items: ["react", "ai"] },
  commits: {
    status: "ok",
    total: 247,
    firstAt: "2022-01-01T00:00:00Z",
    lastAt: "2026-04-01T00:00:00Z",
  },
  contributors: { status: "ok", count: 4 },
  issuesAndPRs: { status: "ok", closedTotal: 47 },
  testFramework: { status: "ok", name: "jest" },
  verifiedStack: { status: "ok", items: ["Next.js", "Drizzle ORM"] },
  // v2 fields required by the schema — minimal values that satisfy the
  // types without changing existing assertions.
  commitActivity: { status: "ok", activeDayCount: 45, totalWeeks: 52 },
  commitMessages: {
    status: "ok",
    total: 30,
    meaningfulCount: 25,
    sample: ["feat: add CI config", "fix: handle null token"],
  },
  externalUrl: null,
  authorshipSignal: { status: "missing", reason: "fixture" },
};

describe("<CredibilityBadges />", () => {
  it("renders nothing for null signals", () => {
    const { container } = render(<CredibilityBadges signals={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("compact mode renders CI + languages + commits + tests + topics", () => {
    render(<CredibilityBadges signals={okSignals} compact />);
    expect(screen.getByText(/CI passing/i)).toBeInTheDocument();
    expect(screen.getByText(/TypeScript 80%/)).toBeInTheDocument();
    expect(screen.getByText(/247 commits/)).toBeInTheDocument();
    expect(screen.getByText(/Tested with Jest/)).toBeInTheDocument();
    expect(screen.getByText("react")).toBeInTheDocument();
    expect(screen.getByText("ai")).toBeInTheDocument();
  });

  it("full mode renders workflow categories", () => {
    render(<CredibilityBadges signals={okSignals} />);
    const wf = screen.getByText(/3 workflows/);
    expect(wf).toBeInTheDocument();
    // Categories with n>0 appear in the label
    expect(wf.textContent).toMatch(/test/);
    expect(wf.textContent).toMatch(/deploy/);
    expect(wf.textContent).toMatch(/lint/);
  });

  it("renders CI as failing with error icon and styling when conclusion=failure", () => {
    const failing: CredibilitySignals = {
      ...okSignals,
      ci: {
        status: "ok",
        conclusion: "failure",
        runUrl: "https://x.test",
        runAt: new Date().toISOString(),
      },
    };
    render(<CredibilityBadges signals={failing} compact />);
    expect(screen.getByText(/CI failing/i)).toBeInTheDocument();
  });

  it("renders 'No CI' when CI status is missing", () => {
    const noCi: CredibilitySignals = { ...okSignals, ci: { status: "missing" } };
    render(<CredibilityBadges signals={noCi} compact />);
    expect(screen.getByText(/No CI/i)).toBeInTheDocument();
  });

  it("hides CI entirely when status is error (no flapping on transient errors)", () => {
    const errCi: CredibilitySignals = { ...okSignals, ci: { status: "error" } };
    render(<CredibilityBadges signals={errCi} compact />);
    expect(screen.queryByText(/CI/i)).not.toBeInTheDocument();
  });

  it("links CI badge to the workflow run URL", () => {
    render(<CredibilityBadges signals={okSignals} compact />);
    const link = screen.getByText(/CI passing/i).closest("a");
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/demo/actions/runs/1"
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("full mode renders verified stack chips", () => {
    render(<CredibilityBadges signals={okSignals} />);
    expect(screen.getByText("Next.js")).toBeInTheDocument();
    expect(screen.getByText("Drizzle ORM")).toBeInTheDocument();
  });

  it("full mode renders releases with tag", () => {
    render(<CredibilityBadges signals={okSignals} />);
    expect(screen.getByText(/12 releases/)).toBeInTheDocument();
    expect(screen.getByText(/v1\.2\.0/)).toBeInTheDocument();
  });
});
