import { parseLinkHeaderLast } from "@/lib/github/link-header";

describe("parseLinkHeaderLast", () => {
  it("returns null for null/empty", () => {
    expect(parseLinkHeaderLast(null)).toBeNull();
    expect(parseLinkHeaderLast("")).toBeNull();
  });

  it("returns null when no rel=last entry is present", () => {
    const header =
      '<https://api.github.com/repos/x/y/commits?page=2>; rel="next"';
    expect(parseLinkHeaderLast(header)).toBeNull();
  });

  it("extracts page number from a standard two-entry header", () => {
    const header =
      '<https://api.github.com/repos/x/y/commits?per_page=1&page=2>; rel="next", ' +
      '<https://api.github.com/repos/x/y/commits?per_page=1&page=247>; rel="last"';
    expect(parseLinkHeaderLast(header)).toBe(247);
  });

  it("handles rel=last as the first entry", () => {
    const header =
      '<https://api.github.com/repos/x/y/issues?page=42>; rel="last", ' +
      '<https://api.github.com/repos/x/y/issues?page=2>; rel="next"';
    expect(parseLinkHeaderLast(header)).toBe(42);
  });

  it("handles four-entry headers (first/prev/next/last)", () => {
    const header =
      '<https://api.github.com/x?page=1>; rel="first", ' +
      '<https://api.github.com/x?page=5>; rel="prev", ' +
      '<https://api.github.com/x?page=7>; rel="next", ' +
      '<https://api.github.com/x?page=123>; rel="last"';
    expect(parseLinkHeaderLast(header)).toBe(123);
  });

  it("returns null when the URL has no page param", () => {
    const header =
      '<https://api.github.com/x?per_page=100>; rel="last"';
    expect(parseLinkHeaderLast(header)).toBeNull();
  });

  it("returns null for non-numeric page values", () => {
    const header =
      '<https://api.github.com/x?page=abc>; rel="last"';
    expect(parseLinkHeaderLast(header)).toBeNull();
  });

  it("handles extra whitespace around entries", () => {
    const header =
      '  <https://api.github.com/x?page=10>; rel="last"  ';
    expect(parseLinkHeaderLast(header)).toBe(10);
  });
});
