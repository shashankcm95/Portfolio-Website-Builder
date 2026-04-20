/**
 * @jest-environment node
 *
 * Unit tests for the LLM pricing table + cost math.
 */

import { PRICING, costMicroUsd, formatMicroUsd } from "@/lib/ai/pricing";

describe("costMicroUsd", () => {
  it("computes known OpenAI models correctly", () => {
    // 1000 input × 15 µUSD + 500 output × 60 µUSD = 45_000
    expect(costMicroUsd("gpt-4o-mini", 1000, 500)).toBe(45_000);
    // 100 × 2500 + 100 × 10000 = 1_250_000 µUSD ($1.25)
    expect(costMicroUsd("gpt-4o", 100, 100)).toBe(1_250_000);
  });

  it("computes embeddings at output=0", () => {
    expect(costMicroUsd("text-embedding-3-small", 10_000, 0)).toBe(20_000);
    expect(costMicroUsd("text-embedding-3-small", 10_000, 999)).toBe(20_000);
  });

  it("returns 0 for unknown models (don't throw)", () => {
    expect(costMicroUsd("gpt-5-superduper", 1000, 1000)).toBe(0);
    expect(costMicroUsd("", 1000, 1000)).toBe(0);
    expect(costMicroUsd(null, 1000, 1000)).toBe(0);
    expect(costMicroUsd(undefined, 1000, 1000)).toBe(0);
  });

  it("clamps negative token counts to zero", () => {
    expect(costMicroUsd("gpt-4o-mini", -5, -10)).toBe(0);
    expect(costMicroUsd("gpt-4o-mini", -5, 10)).toBe(600);
  });

  it("truncates fractional token counts", () => {
    // Token counts shouldn't be fractional, but if a caller passes one
    // (e.g. from an averaged estimate) we truncate rather than NaN.
    expect(costMicroUsd("gpt-4o-mini", 100.7, 200.9)).toBe(
      100 * 15 + 200 * 60
    );
  });

  it("stays integer-safe for large token counts", () => {
    // 1M in + 1M out on gpt-4o-mini = 15_000_000 + 60_000_000 µUSD = 75M
    const cost = costMicroUsd("gpt-4o-mini", 1_000_000, 1_000_000);
    expect(cost).toBe(75_000_000);
    expect(Number.isInteger(cost)).toBe(true);
  });
});

describe("PRICING table", () => {
  it("is frozen — mutation attempts are no-ops", () => {
    expect(Object.isFrozen(PRICING)).toBe(true);
  });

  it("has entries for every model we currently use in production", () => {
    for (const model of [
      "gpt-4o-mini",
      "text-embedding-3-small",
      "claude-haiku-4-5",
    ]) {
      expect(PRICING[model]).toBeDefined();
    }
  });
});

describe("formatMicroUsd", () => {
  it("formats zero cleanly", () => {
    expect(formatMicroUsd(0)).toBe("$0.0000");
  });
  it("formats sub-cent amounts", () => {
    expect(formatMicroUsd(150_000)).toBe("$0.1500");
  });
  it("formats larger amounts with full precision", () => {
    expect(formatMicroUsd(12_345_678)).toBe("$12.3457");
  });
  it("handles non-finite gracefully", () => {
    expect(formatMicroUsd(NaN)).toBe("$0.0000");
    expect(formatMicroUsd(Infinity)).toBe("$0.0000");
  });
});
