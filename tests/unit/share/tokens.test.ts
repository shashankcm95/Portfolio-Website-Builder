/**
 * @jest-environment node
 *
 * Unit tests for `src/lib/share/tokens.ts`. Locks the Crockford
 * alphabet + length contract and spot-checks distribution so accidental
 * biases (e.g. an `& 0x1f` typo'd as `& 0x0f`) are caught.
 */

import {
  CROCKFORD_ALPHABET,
  SHARE_TOKEN_LENGTH,
  SHARE_TOKEN_REGEX,
  generateShareToken,
  isValidShareTokenShape,
} from "@/lib/share/tokens";

describe("generateShareToken", () => {
  it("produces a string of the right length", () => {
    const t = generateShareToken();
    expect(t).toHaveLength(SHARE_TOKEN_LENGTH);
  });

  it("uses only Crockford-alphabet characters", () => {
    const t = generateShareToken();
    expect(SHARE_TOKEN_REGEX.test(t)).toBe(true);
    // Explicit check against the forbidden characters in Crockford.
    expect(t).not.toMatch(/[ILOUilou]/);
  });

  it("produces 1024 distinct tokens (no collisions at our keyspace)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1024; i++) seen.add(generateShareToken());
    expect(seen.size).toBe(1024);
  });

  it("covers a broad slice of the alphabet across many draws", () => {
    // Smoke check for distribution: across 2000 tokens (= 48,000 chars),
    // every alphabet character should appear at least once. A broken
    // bitmask (e.g. `& 0x0f` instead of `& 0x1f`) would omit the upper
    // half of the alphabet and fail this.
    const counts = new Map<string, number>();
    for (let i = 0; i < 2000; i++) {
      for (const c of generateShareToken()) {
        counts.set(c, (counts.get(c) ?? 0) + 1);
      }
    }
    for (const c of CROCKFORD_ALPHABET) {
      expect(counts.get(c) ?? 0).toBeGreaterThan(0);
    }
  });
});

describe("isValidShareTokenShape", () => {
  it("accepts a generated token", () => {
    expect(isValidShareTokenShape(generateShareToken())).toBe(true);
  });

  it("rejects strings that are too short or too long", () => {
    expect(isValidShareTokenShape("A".repeat(SHARE_TOKEN_LENGTH - 1))).toBe(
      false
    );
    expect(isValidShareTokenShape("A".repeat(SHARE_TOKEN_LENGTH + 1))).toBe(
      false
    );
  });

  it("rejects strings containing non-Crockford characters", () => {
    // Replace a valid char with each forbidden letter in turn.
    const base = generateShareToken();
    for (const bad of ["I", "L", "O", "U", "i", "l", "o", "u", "!", "-"]) {
      expect(isValidShareTokenShape(bad + base.slice(1))).toBe(false);
    }
  });

  it("rejects non-string inputs without throwing", () => {
    // @ts-expect-error — runtime-fuzz check
    expect(isValidShareTokenShape(null)).toBe(false);
    // @ts-expect-error
    expect(isValidShareTokenShape(undefined)).toBe(false);
    // @ts-expect-error
    expect(isValidShareTokenShape(42)).toBe(false);
  });

  it("rejects the empty string", () => {
    expect(isValidShareTokenShape("")).toBe(false);
  });
});
