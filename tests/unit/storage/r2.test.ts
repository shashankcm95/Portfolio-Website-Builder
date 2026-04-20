/**
 * @jest-environment node
 *
 * Pure unit tests for the R2 storage module. No SDK calls are exercised
 * here — `putObject` and `deleteObject` are covered in the API-route
 * integration tests where `@aws-sdk/client-s3` is mocked.
 */

import {
  _resetR2ConfigCacheForTests,
  buildObjectKey,
  extFromMime,
  getR2Config,
  isOurObject,
} from "@/lib/storage/r2";

const originalEnv = { ...process.env };

function setConfiguredEnv() {
  process.env.R2_ACCOUNT_ID = "abc123";
  process.env.R2_ACCESS_KEY_ID = "AKIA_test";
  process.env.R2_SECRET_ACCESS_KEY = "secret_test";
  process.env.R2_BUCKET = "demos";
  process.env.R2_PUBLIC_BASE_URL = "https://pub-xyz.r2.dev";
}

function clearR2Env() {
  delete process.env.R2_ACCOUNT_ID;
  delete process.env.R2_ACCESS_KEY_ID;
  delete process.env.R2_SECRET_ACCESS_KEY;
  delete process.env.R2_BUCKET;
  delete process.env.R2_PUBLIC_BASE_URL;
}

afterEach(() => {
  process.env = { ...originalEnv };
  _resetR2ConfigCacheForTests();
});

// ─── getR2Config ────────────────────────────────────────────────────────────

describe("getR2Config", () => {
  it("returns configured with all env vars set", () => {
    setConfiguredEnv();
    const result = getR2Config();
    expect(result.configured).toBe(true);
    if (!result.configured) return;
    expect(result.config.accountId).toBe("abc123");
    expect(result.config.bucket).toBe("demos");
    expect(result.config.publicBaseUrl).toBe("https://pub-xyz.r2.dev");
  });

  it("strips trailing slashes from publicBaseUrl", () => {
    setConfiguredEnv();
    process.env.R2_PUBLIC_BASE_URL = "https://pub-xyz.r2.dev///";
    const result = getR2Config();
    expect(result.configured).toBe(true);
    if (!result.configured) return;
    expect(result.config.publicBaseUrl).toBe("https://pub-xyz.r2.dev");
  });

  it("returns structured reason for each missing var", () => {
    clearR2Env();
    expect(getR2Config()).toEqual({
      configured: false,
      reason: "Missing R2_ACCOUNT_ID",
    });

    _resetR2ConfigCacheForTests();
    process.env.R2_ACCOUNT_ID = "abc";
    expect(getR2Config()).toEqual({
      configured: false,
      reason: "Missing R2_ACCESS_KEY_ID",
    });

    _resetR2ConfigCacheForTests();
    process.env.R2_ACCESS_KEY_ID = "k";
    expect(getR2Config()).toEqual({
      configured: false,
      reason: "Missing R2_SECRET_ACCESS_KEY",
    });

    _resetR2ConfigCacheForTests();
    process.env.R2_SECRET_ACCESS_KEY = "s";
    expect(getR2Config()).toEqual({
      configured: false,
      reason: "Missing R2_BUCKET",
    });

    _resetR2ConfigCacheForTests();
    process.env.R2_BUCKET = "b";
    expect(getR2Config()).toEqual({
      configured: false,
      reason: "Missing R2_PUBLIC_BASE_URL",
    });
  });

  it("rejects publicBaseUrl without http(s)://", () => {
    setConfiguredEnv();
    process.env.R2_PUBLIC_BASE_URL = "pub-xyz.r2.dev"; // no scheme
    const result = getR2Config();
    expect(result.configured).toBe(false);
  });

  it("trims whitespace on all vars", () => {
    process.env.R2_ACCOUNT_ID = "  abc  ";
    process.env.R2_ACCESS_KEY_ID = "  k  ";
    process.env.R2_SECRET_ACCESS_KEY = "  s  ";
    process.env.R2_BUCKET = "  b  ";
    process.env.R2_PUBLIC_BASE_URL = "  https://x.example  ";
    const result = getR2Config();
    expect(result.configured).toBe(true);
    if (!result.configured) return;
    expect(result.config.accountId).toBe("abc");
  });

  it("memoizes across calls", () => {
    setConfiguredEnv();
    const a = getR2Config();
    const b = getR2Config();
    expect(a).toBe(b);
  });
});

// ─── buildObjectKey ─────────────────────────────────────────────────────────

describe("buildObjectKey", () => {
  it("encodes userId, projectId, and lowercased ext", () => {
    const key = buildObjectKey("user-1", "proj-2", "PNG");
    expect(key).toMatch(
      /^u\/user-1\/p\/proj-2\/[0-9a-f-]{36}\.png$/
    );
  });

  it("produces unique keys on repeated calls", () => {
    const a = buildObjectKey("u", "p", "jpg");
    const b = buildObjectKey("u", "p", "jpg");
    expect(a).not.toBe(b);
  });
});

// ─── extFromMime ────────────────────────────────────────────────────────────

describe("extFromMime", () => {
  it("maps allowlisted MIMEs", () => {
    expect(extFromMime("image/png")).toBe("png");
    expect(extFromMime("image/jpeg")).toBe("jpg");
    expect(extFromMime("image/webp")).toBe("webp");
    expect(extFromMime("image/avif")).toBe("avif");
    expect(extFromMime("image/gif")).toBe("gif");
    expect(extFromMime("video/mp4")).toBe("mp4");
    expect(extFromMime("video/webm")).toBe("webm");
    expect(extFromMime("video/quicktime")).toBe("mov");
  });

  it("is case-insensitive", () => {
    expect(extFromMime("IMAGE/PNG")).toBe("png");
  });

  it("returns null for unknown MIMEs", () => {
    expect(extFromMime("application/pdf")).toBeNull();
    expect(extFromMime("image/svg+xml")).toBeNull();
    expect(extFromMime("text/html")).toBeNull();
    expect(extFromMime("")).toBeNull();
  });
});

// ─── isOurObject ────────────────────────────────────────────────────────────

describe("isOurObject", () => {
  it("returns true for URLs whose hostname matches publicBaseUrl", () => {
    setConfiguredEnv();
    expect(isOurObject("https://pub-xyz.r2.dev/u/u1/p/p1/abc.png")).toBe(
      true
    );
  });

  it("is case-insensitive on hostname", () => {
    setConfiguredEnv();
    expect(isOurObject("https://PUB-XYZ.R2.DEV/u/u1/p/p1/abc.png")).toBe(
      true
    );
  });

  it("returns false for foreign hostnames", () => {
    setConfiguredEnv();
    expect(isOurObject("https://imgur.com/abc.png")).toBe(false);
    expect(isOurObject("https://pub-xyz.r2.dev.evil.com/abc")).toBe(false);
    expect(isOurObject("https://loom.com/share/...")).toBe(false);
  });

  it("returns false when R2 is unconfigured", () => {
    clearR2Env();
    expect(isOurObject("https://anything.example/x.png")).toBe(false);
  });

  it("returns false for malformed URLs", () => {
    setConfiguredEnv();
    expect(isOurObject("not-a-url")).toBe(false);
    expect(isOurObject("")).toBe(false);
  });
});
