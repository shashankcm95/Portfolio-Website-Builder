import { redactSecret } from "@/lib/ai/redact";

describe("redactSecret", () => {
  it("returns '' for null/undefined input", () => {
    expect(redactSecret(null)).toBe("");
    expect(redactSecret(undefined)).toBe("");
  });

  it("masks OpenAI-style sk- keys", () => {
    const msg =
      "Request failed with key sk-proj-ABCDEFGHIJKLMNOPQRSTUVWX — status 401";
    expect(redactSecret(msg)).toBe("Request failed with key *** — status 401");
  });

  it("masks Anthropic-style sk-ant- keys", () => {
    const msg =
      "Error on key sk-ant-api03-aBcDeFgHiJkLmNoPqRsTuVwXyZ : 401";
    expect(redactSecret(msg)).toBe("Error on key *** : 401");
  });

  it("masks plain sk- keys", () => {
    expect(
      redactSecret("sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890")
    ).toBe("***");
  });

  it("leaves benign strings containing 'sk-' alone", () => {
    expect(redactSecret("risk-management")).toBe("risk-management");
    expect(redactSecret("sk-short")).toBe("sk-short"); // too short to match
  });

  it("masks multiple occurrences in one message", () => {
    const msg =
      "Key1: sk-ABCDEFGHIJKLMNOPQRSTUV Key2: sk-ant-ABCDEFGHIJKLMNOPQRSTUV";
    expect(redactSecret(msg)).toBe("Key1: *** Key2: ***");
  });

  it("masks an explicit secret passed in by the caller", () => {
    const msg = "Bad key: custom-secret-string-123";
    expect(redactSecret(msg, "custom-secret-string-123")).toBe("Bad key: ***");
  });

  it("escapes regex metacharacters in explicit secrets", () => {
    const msg = "key=a.b+c?d.efgh other-text";
    expect(redactSecret(msg, "a.b+c?d.efgh")).toBe("key=*** other-text");
  });

  it("ignores an explicit secret shorter than 8 chars", () => {
    // Prevents over-masking when a caller accidentally passes a short
    // string that might match common substrings.
    const msg = "token=abc";
    expect(redactSecret(msg, "abc")).toBe("token=abc");
  });

  it("combines pattern and explicit masking in one pass", () => {
    const msg =
      "sk-ABCDEFGHIJKLMNOPQRSTUV and my-other-secret-456";
    expect(redactSecret(msg, "my-other-secret-456")).toBe(
      "*** and ***"
    );
  });
});
