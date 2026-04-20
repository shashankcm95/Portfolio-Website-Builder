import { verifyGrep } from "@/lib/pipeline/verifier/grep";

const sources = {
  readme: "# Demo\n\nUses JWT authentication for session cookies.",
  file_tree: JSON.stringify([
    { path: "src/auth/jwt.ts" },
    { path: "src/index.ts" },
  ]),
  dependencies: '{"dependencies":{"jsonwebtoken":"9.0.0"}}',
};

describe("verifyGrep", () => {
  it("verifies a pattern found in README", () => {
    const r = verifyGrep(
      { kind: "grep", pattern: "JWT", sources: ["readme"] },
      sources
    );
    expect(r.status).toBe("verified");
    expect(r.evidence).toMatch(/readme/);
  });

  it("is case-insensitive by default", () => {
    const r = verifyGrep(
      { kind: "grep", pattern: "jwt", sources: ["readme"] },
      sources
    );
    expect(r.status).toBe("verified");
  });

  it("verifies against multiple sources; returns first match", () => {
    const r = verifyGrep(
      {
        kind: "grep",
        pattern: "jsonwebtoken",
        sources: ["readme", "dependencies"],
      },
      sources
    );
    expect(r.status).toBe("verified");
    expect(r.evidence).toMatch(/dependencies/);
  });

  it("flags when pattern is not found", () => {
    const r = verifyGrep(
      { kind: "grep", pattern: "bcrypt", sources: ["readme", "dependencies"] },
      sources
    );
    expect(r.status).toBe("flagged");
    expect(r.evidence).toMatch(/not found/i);
  });

  it("flags an invalid regex without throwing", () => {
    const r = verifyGrep(
      { kind: "grep", pattern: "(", sources: ["readme"] },
      sources
    );
    expect(r.status).toBe("flagged");
    expect(r.evidence).toMatch(/Invalid regex/);
  });

  it("rejects patterns exceeding the length cap", () => {
    const long = "a".repeat(201);
    const r = verifyGrep(
      { kind: "grep", pattern: long, sources: ["readme"] },
      sources
    );
    expect(r.status).toBe("flagged");
    expect(r.evidence).toMatch(/too long/i);
  });

  it("handles missing source blobs gracefully", () => {
    const r = verifyGrep(
      { kind: "grep", pattern: "anything", sources: ["readme"] },
      {}
    );
    expect(r.status).toBe("flagged");
  });
});
