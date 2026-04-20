import { toLanguageBreakdown } from "@/lib/github/language-percentages";

describe("toLanguageBreakdown", () => {
  it("returns empty for empty input", () => {
    expect(toLanguageBreakdown({})).toEqual([]);
  });

  it("returns empty when all entries are zero bytes", () => {
    expect(toLanguageBreakdown({ Python: 0, Go: 0 })).toEqual([]);
  });

  it("sorts by bytes descending", () => {
    const result = toLanguageBreakdown({
      Go: 100,
      Python: 300,
      TypeScript: 200,
    });
    expect(result.map((r) => r.name)).toEqual(["Python", "TypeScript", "Go"]);
  });

  it("percentages sum to 100 even with rounding ambiguity", () => {
    // 1/3 each → 33.33, 33.33, 33.33 — floored = 33+33+33=99; largest
    // remainder distribution must push one up to 34.
    const result = toLanguageBreakdown({ A: 1, B: 1, C: 1 });
    const total = result.reduce((s, r) => s + r.pct, 0);
    expect(total).toBe(100);
  });

  it("drops zero-byte entries", () => {
    const result = toLanguageBreakdown({
      TypeScript: 80,
      Makefile: 0,
      Shell: 20,
    });
    expect(result.map((r) => r.name)).toEqual(["TypeScript", "Shell"]);
  });

  it("preserves byte counts on each entry", () => {
    const result = toLanguageBreakdown({ Python: 800, Shell: 200 });
    expect(result[0]).toMatchObject({ name: "Python", bytes: 800, pct: 80 });
    expect(result[1]).toMatchObject({ name: "Shell", bytes: 200, pct: 20 });
  });

  it("handles typical repo breakdown rounding", () => {
    // Resembles a real Next.js repo — pct should sum exactly to 100
    const result = toLanguageBreakdown({
      TypeScript: 9500,
      JavaScript: 300,
      CSS: 150,
      Shell: 50,
    });
    const total = result.reduce((s, r) => s + r.pct, 0);
    expect(total).toBe(100);
    expect(result[0].name).toBe("TypeScript");
  });

  it("single-language repo renders as 100%", () => {
    expect(toLanguageBreakdown({ Rust: 12345 })).toEqual([
      { name: "Rust", bytes: 12345, pct: 100 },
    ]);
  });
});
