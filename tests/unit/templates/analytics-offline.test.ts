/**
 * @jest-environment jsdom
 *
 * Phase 8.5 decoupling regression: the analytics beacon must be
 * fire-and-forget — a failing fetch / sendBeacon must not surface to the
 * visitor, affect the DOM, or leave an unhandled rejection.
 */

// Relative import — nextJest's moduleNameMapper reorders our config and
// consistently resolves `@/templates/...` to `src/templates/...` which
// doesn't exist. Dropping the alias keeps the test portable.
import { buildAnalyticsSnippet } from "../../../templates/_shared/analytics-snippet";

describe("analytics snippet — offline behavior", () => {
  let unhandled: Error | null = null;
  const handler = (event: PromiseRejectionEvent | ErrorEvent) => {
    if ("reason" in event) {
      unhandled = (event.reason as Error) ?? new Error("unhandled rejection");
    } else {
      unhandled = event.error ?? new Error(String(event.message));
    }
  };

  beforeEach(() => {
    unhandled = null;
    // Reset the "fired once" guard so each test starts clean.
    delete (window as any).__pwAnalyticsFired;
    window.addEventListener("unhandledrejection", handler as any);
    window.addEventListener("error", handler as any);
  });

  afterEach(() => {
    window.removeEventListener("unhandledrejection", handler as any);
    window.removeEventListener("error", handler as any);
  });

  it("returns empty string when apiUrl is blank (template skips tag)", () => {
    expect(
      buildAnalyticsSnippet({ apiUrl: "", portfolioId: "p1" })
    ).toBe("");
    expect(
      buildAnalyticsSnippet({ apiUrl: "https://x", portfolioId: "" })
    ).toBe("");
  });

  it("swallows fetch rejection (no unhandled promise, no DOM change)", async () => {
    // Force the fetch branch by pretending navigator.sendBeacon isn't
    // available — the snippet falls back to fetch + keepalive.
    const originalSend = navigator.sendBeacon;
    (navigator as any).sendBeacon = undefined;

    const fetchMock = jest.fn(() =>
      Promise.reject(new Error("network down"))
    ) as jest.Mock;
    (global as any).fetch = fetchMock;

    const snippet = buildAnalyticsSnippet({
      apiUrl: "https://builder.example.com/api/events/track",
      portfolioId: "p1",
    });
    // Snapshot DOM before execution
    const beforeHtml = document.body.innerHTML;

    // eslint-disable-next-line no-eval
    (0, eval)(snippet);

    // Give the promise chain a chance to settle
    await new Promise((r) => setTimeout(r, 10));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(document.body.innerHTML).toBe(beforeHtml);
    expect(unhandled).toBeNull();

    (navigator as any).sendBeacon = originalSend;
  });

  it("swallows sendBeacon throw (no unhandled error, no DOM change)", async () => {
    (navigator as any).sendBeacon = jest.fn(() => {
      throw new Error("beacon boom");
    });

    const snippet = buildAnalyticsSnippet({
      apiUrl: "https://builder.example.com/api/events/track",
      portfolioId: "p1",
    });
    const beforeHtml = document.body.innerHTML;

    // eslint-disable-next-line no-eval
    (0, eval)(snippet);

    await new Promise((r) => setTimeout(r, 10));

    expect(document.body.innerHTML).toBe(beforeHtml);
    expect(unhandled).toBeNull();
  });

  it("only fires once per page load (idempotent)", () => {
    (navigator as any).sendBeacon = jest.fn(() => true);

    const snippet = buildAnalyticsSnippet({
      apiUrl: "https://builder.example.com/api/events/track",
      portfolioId: "p1",
    });
    // eslint-disable-next-line no-eval
    (0, eval)(snippet);
    // eslint-disable-next-line no-eval
    (0, eval)(snippet);

    expect(navigator.sendBeacon).toHaveBeenCalledTimes(1);
  });
});
