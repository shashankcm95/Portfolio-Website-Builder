/**
 * @jest-environment node
 *
 * Unit tests for the analytics bucketing/sanitization helpers.
 */

import {
  bucketUserAgent,
  isSelfReferrer,
  normalizePath,
  sanitizeReferrer,
} from "@/lib/analytics/beacon";

describe("bucketUserAgent", () => {
  it("buckets canonical desktop UAs", () => {
    // Chrome on macOS
    expect(
      bucketUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
      )
    ).toBe("desktop");
    // Firefox on Windows
    expect(
      bucketUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/124.0"
      )
    ).toBe("desktop");
  });

  it("buckets mobile UAs", () => {
    expect(
      bucketUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Mobile/15E148"
      )
    ).toBe("mobile");
    expect(
      bucketUserAgent(
        "Mozilla/5.0 (Linux; Android 14; SM-S918B) Mobile Safari/537.36"
      )
    ).toBe("mobile");
  });

  it("buckets common bots", () => {
    expect(bucketUserAgent("Googlebot/2.1 (+http://www.google.com/bot.html)")).toBe(
      "bot"
    );
    expect(bucketUserAgent("Twitterbot/1.0")).toBe("bot");
    expect(
      bucketUserAgent("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)")
    ).toBe("bot");
    expect(bucketUserAgent("LinkedInBot/1.0")).toBe("bot");
    expect(bucketUserAgent("Slackbot-LinkExpanding 1.0")).toBe("bot");
    expect(bucketUserAgent("HeadlessChrome/120.0.0.0")).toBe("bot");
    expect(bucketUserAgent("Mozilla/5.0 (compatible; bingbot/2.0)")).toBe(
      "bot"
    );
  });

  it("returns 'unknown' for missing UA", () => {
    expect(bucketUserAgent(null)).toBe("unknown");
    expect(bucketUserAgent(undefined)).toBe("unknown");
    expect(bucketUserAgent("")).toBe("unknown");
  });

  it("returns 'other' for unrecognized strings", () => {
    expect(bucketUserAgent("curl/7.79.1")).toBe("other");
  });
});

describe("sanitizeReferrer", () => {
  it("reduces a full URL to its origin", () => {
    expect(sanitizeReferrer("https://twitter.com/someone/status/123?x=y#frag")).toBe(
      "https://twitter.com"
    );
    expect(sanitizeReferrer("http://news.ycombinator.com/item?id=1")).toBe(
      "http://news.ycombinator.com"
    );
  });

  it("returns null for malformed URLs", () => {
    expect(sanitizeReferrer("not-a-url")).toBeNull();
    expect(sanitizeReferrer("")).toBeNull();
    expect(sanitizeReferrer(null)).toBeNull();
  });

  it("rejects non-http schemes", () => {
    expect(sanitizeReferrer("javascript:alert(1)")).toBeNull();
    expect(sanitizeReferrer("data:text/plain;base64,AAA")).toBeNull();
  });
});

describe("isSelfReferrer", () => {
  it("true when the referrer origin matches appOrigin", () => {
    expect(
      isSelfReferrer(
        "https://app.example/portfolios/pf1?tab=preview",
        "https://app.example"
      )
    ).toBe(true);
  });

  it("false on origin mismatch", () => {
    expect(
      isSelfReferrer("https://twitter.com/foo", "https://app.example")
    ).toBe(false);
  });

  it("false when appOrigin is unset", () => {
    expect(isSelfReferrer("https://app.example/foo", null)).toBe(false);
    expect(isSelfReferrer("https://app.example/foo", "")).toBe(false);
  });

  it("tolerates trailing slash in appOrigin", () => {
    expect(
      isSelfReferrer("https://app.example/x", "https://app.example/")
    ).toBe(true);
  });
});

describe("normalizePath", () => {
  it("preserves the leading slash and strips trailing", () => {
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("/about")).toBe("/about");
    expect(normalizePath("/about/")).toBe("/about");
    expect(normalizePath("about")).toBe("/about");
  });

  it("caps at 2048 chars", () => {
    const long = "/" + "x".repeat(3000);
    expect(normalizePath(long)?.length).toBe(2048);
  });

  it("returns null for empty / null", () => {
    expect(normalizePath("")).toBeNull();
    expect(normalizePath(null)).toBeNull();
    expect(normalizePath("   ")).toBeNull();
  });
});
