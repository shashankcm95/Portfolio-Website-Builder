import { pLimit } from "@/lib/github/concurrency";

describe("pLimit", () => {
  it("throws on invalid max", () => {
    expect(() => pLimit(0)).toThrow();
    expect(() => pLimit(-1)).toThrow();
    expect(() => pLimit(Number.POSITIVE_INFINITY)).toThrow();
  });

  it("resolves all tasks", async () => {
    const limit = pLimit(2);
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((n) => limit(async () => n * 10))
    );
    expect(results).toEqual([10, 20, 30, 40, 50]);
  });

  it("never exceeds the configured max in-flight count", async () => {
    const limit = pLimit(2);
    let active = 0;
    let peak = 0;

    const task = async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
    };

    await Promise.all(Array.from({ length: 10 }, () => limit(task)));

    expect(peak).toBeLessThanOrEqual(2);
  });

  it("propagates rejection from a task without stalling the queue", async () => {
    const limit = pLimit(2);
    const results = await Promise.allSettled([
      limit(async () => "a"),
      limit(async () => {
        throw new Error("boom");
      }),
      limit(async () => "c"),
    ]);
    expect(results[0].status).toBe("fulfilled");
    expect(results[1].status).toBe("rejected");
    expect(results[2].status).toBe("fulfilled");
  });

  it("pLimit(1) runs tasks sequentially", async () => {
    const limit = pLimit(1);
    const order: number[] = [];
    await Promise.all(
      [0, 1, 2].map((i) =>
        limit(async () => {
          order.push(i);
          await new Promise((r) => setTimeout(r, 5));
          order.push(i + 100);
        })
      )
    );
    // Each task's enter + exit should be adjacent (no interleaving)
    expect(order).toEqual([0, 100, 1, 101, 2, 102]);
  });
});
