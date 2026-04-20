import {
  countActiveDays,
  fetchCommitActivity,
} from "@/lib/github/commit-activity-fetcher";

function makeClient(
  behavior:
    | { ok: true; data: unknown }
    | { ok: false; error: Error }
) {
  return {
    async getWithHeaders() {
      if (behavior.ok) {
        return { data: behavior.data, headers: new Headers() };
      }
      throw behavior.error;
    },
  } as any;
}

describe("countActiveDays", () => {
  it("returns 0 for empty input", () => {
    expect(countActiveDays([])).toBe(0);
  });

  it("sums distinct (week × day) slots where count > 0", () => {
    const weeks = [
      { week: 0, total: 5, days: [0, 1, 0, 2, 0, 1, 0] }, // 3 active
      { week: 1, total: 0, days: [0, 0, 0, 0, 0, 0, 0] }, // 0 active
      { week: 2, total: 10, days: [3, 3, 3, 0, 0, 0, 0] }, // 3 active
    ];
    expect(countActiveDays(weeks)).toBe(6);
  });

  it("ignores weeks with malformed days arrays", () => {
    const weeks = [
      { week: 0, total: 5, days: [1, 1, 1, 1, 1, 0, 0] },
      { week: 1, total: 0, days: undefined as any },
    ];
    expect(countActiveDays(weeks)).toBe(5);
  });

  it("counts days exactly once regardless of commit volume", () => {
    const weeks = [{ week: 0, total: 100, days: [50, 50, 0, 0, 0, 0, 0] }];
    expect(countActiveDays(weeks)).toBe(2);
  });
});

describe("fetchCommitActivity", () => {
  it("returns status=ok with activeDayCount for a normal response", async () => {
    const weeks = [
      { week: 0, total: 3, days: [1, 0, 1, 0, 1, 0, 0] }, // 3 active
      { week: 1, total: 2, days: [0, 0, 1, 1, 0, 0, 0] }, // 2 active
    ];
    const client = makeClient({ ok: true, data: weeks });
    const result = await fetchCommitActivity(client, "acme", "demo");
    expect(result).toEqual({
      status: "ok",
      activeDayCount: 5,
      totalWeeks: 52,
    });
  });

  it("returns status=missing for an empty array (no commits yet)", async () => {
    const client = makeClient({ ok: true, data: [] });
    const result = await fetchCommitActivity(client, "acme", "demo");
    expect(result).toEqual({ status: "missing" });
  });

  it("returns status=missing when response body is null", async () => {
    const client = makeClient({ ok: true, data: null });
    const result = await fetchCommitActivity(client, "acme", "demo");
    expect(result).toEqual({ status: "missing" });
  });

  it("returns status=missing when GitHub returns 202 (stats computing)", async () => {
    const client = makeClient({
      ok: false,
      error: new Error("GitHub API error 202 (Accepted) for /foo"),
    });
    const result = await fetchCommitActivity(client, "acme", "demo");
    expect(result).toEqual({ status: "missing" });
  });

  it("returns status=missing when GitHub returns 204 (empty repo)", async () => {
    const client = makeClient({
      ok: false,
      error: new Error("GitHub API error 204 (No Content) for /foo"),
    });
    const result = await fetchCommitActivity(client, "acme", "demo");
    expect(result).toEqual({ status: "missing" });
  });

  it("returns status=error for a 5xx response", async () => {
    const client = makeClient({
      ok: false,
      error: new Error("GitHub API error 500 (Internal) for /foo"),
    });
    const result = await fetchCommitActivity(client, "acme", "demo");
    expect(result).toEqual({ status: "error" });
  });
});
