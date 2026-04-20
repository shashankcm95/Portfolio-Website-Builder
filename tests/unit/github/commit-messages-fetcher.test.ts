import { fetchRecentCommitMessages } from "@/lib/github/commit-messages-fetcher";

function makeClient(
  behavior: { ok: true; data: unknown } | { ok: false; error: Error }
) {
  return {
    async get() {
      if (behavior.ok) return behavior.data;
      throw behavior.error;
    },
  } as any;
}

describe("fetchRecentCommitMessages", () => {
  it("returns total=0 when the response is empty", async () => {
    const client = makeClient({ ok: true, data: [] });
    const result = await fetchRecentCommitMessages(client, "acme", "demo");
    expect(result).toEqual({
      status: "ok",
      total: 0,
      meaningfulCount: 0,
      sample: [],
    });
  });

  it("extracts first-line messages and counts meaningful ones", async () => {
    const client = makeClient({
      ok: true,
      data: [
        {
          commit: {
            message: "Add JWT middleware to auth routes\n\nbody here",
          },
        },
        {
          commit: { message: "fix" },
        },
        {
          commit: { message: "Refactor pipeline orchestrator for retry" },
        },
        {
          commit: { message: "wip" },
        },
        {
          commit: { message: "feat(ui): add dashboard hover cards" },
        },
      ],
    });
    const result = await fetchRecentCommitMessages(client, "acme", "demo");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.total).toBe(5);
    expect(result.meaningfulCount).toBe(3);
    // Sample preserves order (first 5)
    expect(result.sample[0]).toBe("Add JWT middleware to auth routes");
    expect(result.sample[1]).toBe("fix");
  });

  it("truncates sample to 5 even for larger fetches", async () => {
    const client = makeClient({
      ok: true,
      data: Array.from({ length: 10 }, (_, i) => ({
        commit: { message: `Descriptive message number ${i} abcdef` },
      })),
    });
    const result = await fetchRecentCommitMessages(client, "acme", "demo", 10);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.total).toBe(10);
    expect(result.sample).toHaveLength(5);
  });

  it("returns status=error on network failure", async () => {
    const client = makeClient({
      ok: false,
      error: new Error("GitHub API error 500"),
    });
    const result = await fetchRecentCommitMessages(client, "acme", "demo");
    expect(result).toEqual({ status: "error" });
  });

  it("handles multiline messages (takes first line only)", async () => {
    const client = makeClient({
      ok: true,
      data: [
        {
          commit: {
            message: "Short\nbut the body explains a lot more context here",
          },
        },
      ],
    });
    const result = await fetchRecentCommitMessages(client, "acme", "demo");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    // First line "Short" is too short → not meaningful
    expect(result.meaningfulCount).toBe(0);
  });
});
