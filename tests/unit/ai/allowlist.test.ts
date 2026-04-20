import {
  ANTHROPIC_MODELS,
  DEFAULT_MODELS,
  OPENAI_MODELS,
  getDefaultModel,
  getModelsFor,
  validateModel,
} from "@/lib/ai/providers/allowlist";

describe("model allowlist", () => {
  it("exposes separate lists per provider", () => {
    expect(OPENAI_MODELS.length).toBeGreaterThan(0);
    expect(ANTHROPIC_MODELS.length).toBeGreaterThan(0);
    // No accidental overlap (no one model ID is valid on both providers)
    const overlap = OPENAI_MODELS.filter((m) =>
      (ANTHROPIC_MODELS as readonly string[]).includes(m)
    );
    expect(overlap).toEqual([]);
  });

  it("getModelsFor returns the right list per provider", () => {
    expect(getModelsFor("openai")).toBe(OPENAI_MODELS);
    expect(getModelsFor("anthropic")).toBe(ANTHROPIC_MODELS);
  });

  it("getDefaultModel returns allowlisted defaults", () => {
    expect(validateModel("openai", getDefaultModel("openai"))).toBe(true);
    expect(validateModel("anthropic", getDefaultModel("anthropic"))).toBe(true);
  });

  it("DEFAULT_MODELS keys are exactly the two providers", () => {
    expect(Object.keys(DEFAULT_MODELS).sort()).toEqual([
      "anthropic",
      "openai",
    ]);
  });

  describe("validateModel", () => {
    it("accepts a known OpenAI model", () => {
      expect(validateModel("openai", "gpt-4o-mini")).toBe(true);
    });

    it("accepts a known Anthropic model", () => {
      expect(validateModel("anthropic", "claude-haiku-4-5")).toBe(true);
    });

    it("rejects an Anthropic model under the OpenAI provider", () => {
      expect(validateModel("openai", "claude-haiku-4-5")).toBe(false);
    });

    it("rejects an OpenAI model under the Anthropic provider", () => {
      expect(validateModel("anthropic", "gpt-4o-mini")).toBe(false);
    });

    it("rejects an unknown model name", () => {
      expect(validateModel("openai", "gpt-99-ultra")).toBe(false);
      expect(validateModel("anthropic", "claude-42")).toBe(false);
    });

    it("rejects an empty string", () => {
      expect(validateModel("openai", "")).toBe(false);
    });
  });
});
