/**
 * @jest-environment node
 *
 * Factory fallback chain:
 *   1. BYOK row populated      → decrypt + openai/anthropic client
 *   2. No BYOK + OPENAI_API_KEY → platform openai
 *   3. No BYOK + only ANTHROPIC_API_KEY → platform anthropic
 *   4. None → LlmNotConfiguredError
 */

import { encryptSecret } from "@/lib/crypto/secret-box";

// Mock Drizzle: each test seeds `mockUserRows` with a single row shape
const mockUserRows: Array<Record<string, unknown>> = [];

jest.mock("@/lib/db", () => {
  function chain() {
    const self: any = {
      from: () => self,
      innerJoin: () => self,
      where: () => self,
      limit: async () => mockUserRows.slice(),
    };
    return self;
  }
  return { db: { select: jest.fn(() => chain()) } };
});

jest.mock("drizzle-orm", () => {
  const actual = jest.requireActual("drizzle-orm");
  return {
    ...actual,
    eq: jest.fn(() => "eq"),
    and: jest.fn(() => "and"),
  };
});

import {
  getLlmClientForUser,
  hasLlmConfigForUser,
  _internals,
} from "@/lib/ai/providers/factory";
import { LlmNotConfiguredError } from "@/lib/ai/providers/types";

const originalEnv = { ...process.env };

afterEach(() => {
  mockUserRows.length = 0;
  process.env = { ...originalEnv };
});

describe("fallback chain", () => {
  it("returns byok openai client when all three byok columns are set", async () => {
    mockUserRows.push({
      provider: "openai",
      keyEncrypted: encryptSecret("sk-user-byok"),
      model: "gpt-4o-mini",
    });

    const config = await _internals.resolveConfigForUser("u1");
    expect(config).toEqual({
      provider: "openai",
      apiKey: "sk-user-byok",
      model: "gpt-4o-mini",
      source: "byok",
    });

    const client = await getLlmClientForUser("u1");
    expect(client.provider).toBe("openai");
    expect(client.model).toBe("gpt-4o-mini");
  });

  it("returns byok anthropic client", async () => {
    mockUserRows.push({
      provider: "anthropic",
      keyEncrypted: encryptSecret("sk-ant-user"),
      model: "claude-haiku-4-5",
    });

    const client = await getLlmClientForUser("u1");
    expect(client.provider).toBe("anthropic");
    expect(client.model).toBe("claude-haiku-4-5");
  });

  it("falls back to platform openai when no byok and OPENAI_API_KEY set", async () => {
    mockUserRows.push({ provider: null, keyEncrypted: null, model: null });
    process.env.OPENAI_API_KEY = "sk-platform-openai";
    delete process.env.ANTHROPIC_API_KEY;

    const config = await _internals.resolveConfigForUser("u1");
    expect(config).toEqual({
      provider: "openai",
      apiKey: "sk-platform-openai",
      model: "gpt-4o-mini",
      source: "platform",
    });
  });

  it("respects OPENAI_DEFAULT_MODEL when set", async () => {
    mockUserRows.push({ provider: null });
    process.env.OPENAI_API_KEY = "sk-platform";
    process.env.OPENAI_DEFAULT_MODEL = "gpt-4o";

    const config = await _internals.resolveConfigForUser("u1");
    expect(config.model).toBe("gpt-4o");
  });

  it("falls back to platform anthropic only when openai env is absent", async () => {
    mockUserRows.push({ provider: null });
    delete process.env.OPENAI_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-ant-platform";

    const config = await _internals.resolveConfigForUser("u1");
    expect(config).toEqual({
      provider: "anthropic",
      apiKey: "sk-ant-platform",
      model: "claude-haiku-4-5",
      source: "platform",
    });
  });

  it("prefers openai over anthropic when both platform envs are set", async () => {
    mockUserRows.push({ provider: null });
    process.env.OPENAI_API_KEY = "sk-openai";
    process.env.ANTHROPIC_API_KEY = "sk-ant-ignored";

    const config = await _internals.resolveConfigForUser("u1");
    expect(config.provider).toBe("openai");
  });

  it("throws LlmNotConfiguredError when no BYOK and no platform env", async () => {
    mockUserRows.push({ provider: null });
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    await expect(getLlmClientForUser("u1")).rejects.toThrow(
      LlmNotConfiguredError
    );
  });

  it("falls back to platform when stored BYOK model is not on the allowlist", async () => {
    mockUserRows.push({
      provider: "openai",
      keyEncrypted: encryptSecret("sk-byok"),
      model: "gpt-made-up", // invalid
    });
    process.env.OPENAI_API_KEY = "sk-platform";

    const config = await _internals.resolveConfigForUser("u1");
    expect(config.source).toBe("platform");
  });

  it("treats a missing user row as 'no byok' and still checks platform env", async () => {
    // Empty rows array — factory should not throw about missing user
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    await expect(getLlmClientForUser("u-nobody")).rejects.toThrow(
      LlmNotConfiguredError
    );
  });
});

describe("hasLlmConfigForUser", () => {
  it("returns true when platform env is set", async () => {
    mockUserRows.push({ provider: null });
    process.env.OPENAI_API_KEY = "sk-platform";
    await expect(hasLlmConfigForUser("u1")).resolves.toBe(true);
  });

  it("returns false when nothing is configured", async () => {
    mockUserRows.push({ provider: null });
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    await expect(hasLlmConfigForUser("u1")).resolves.toBe(false);
  });

  it("returns true when BYOK is set (even with no env)", async () => {
    mockUserRows.push({
      provider: "anthropic",
      keyEncrypted: encryptSecret("sk-ant-byok"),
      model: "claude-haiku-4-5",
    });
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    await expect(hasLlmConfigForUser("u1")).resolves.toBe(true);
  });
});
