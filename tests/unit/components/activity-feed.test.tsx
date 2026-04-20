import { render, screen, waitFor } from "@testing-library/react";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import type { ActivityEvent } from "@/lib/activity";

// ─── fetch mocking ──────────────────────────────────────────────────────────
const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

function mockFetch(body: unknown, ok = true) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  });
}

const sampleEvents: ActivityEvent[] = [
  {
    id: "pf_created:p1",
    type: "portfolio_created",
    title: 'Created portfolio "Alpha"',
    description: null,
    href: "/portfolios/p1",
    portfolioId: "p1",
    projectId: null,
    occurredAt: new Date(Date.now() - 60_000).toISOString(),
  },
  {
    id: "deploy:d1",
    type: "deployment_live",
    title: "Deployed to production",
    description: "https://alpha.pages.dev",
    href: "/portfolios/p1?tab=deploy",
    portfolioId: "p1",
    projectId: null,
    occurredAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  },
];

describe("<ActivityFeed />", () => {
  it("shows a loading state initially", async () => {
    mockFetch({ events: [] });
    render(<ActivityFeed />);
    expect(screen.getByText(/loading activity/i)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText(/loading activity/i)).not.toBeInTheDocument()
    );
  });

  it("renders an empty state when the feed is empty", async () => {
    mockFetch({ events: [] });
    render(<ActivityFeed />);
    await waitFor(() =>
      expect(screen.getByText(/no recent activity/i)).toBeInTheDocument()
    );
    expect(
      screen.getByText(/create a portfolio to get started/i)
    ).toBeInTheDocument();
  });

  it("renders populated events with links", async () => {
    mockFetch({ events: sampleEvents });
    render(<ActivityFeed />);
    await waitFor(() =>
      expect(screen.getByText('Created portfolio "Alpha"')).toBeInTheDocument()
    );

    const link = screen.getByText("Deployed to production").closest("a");
    expect(link).toHaveAttribute("href", "/portfolios/p1?tab=deploy");
    expect(screen.getByText("https://alpha.pages.dev")).toBeInTheDocument();
  });

  it("shows an error state when the fetch fails", async () => {
    mockFetch({ error: "boom" }, false);
    render(<ActivityFeed />);
    await waitFor(() =>
      expect(screen.getByText(/couldn't load activity/i)).toBeInTheDocument()
    );
  });

  it("requests the configured limit in the URL", async () => {
    mockFetch({ events: [] });
    render(<ActivityFeed limit={25} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith("/api/activity?limit=25");
  });
});
