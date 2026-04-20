import { verifyClaim, type VerifierContext } from "@/lib/pipeline/verifier";

const emptyCtx: VerifierContext = {
  depsParsed: [],
  fileTreePaths: [],
  workflows: [],
  sourceBlobs: {},
};

const populatedCtx: VerifierContext = {
  depsParsed: [{ name: "next", ecosystem: "npm" }],
  fileTreePaths: ["Dockerfile", "src/index.ts"],
  workflows: [{ name: "CI", category: "test" }],
  sourceBlobs: { readme: "uses JWT for auth" },
};

describe("verifyClaim — dispatcher", () => {
  it("dispatches dep", () => {
    expect(
      verifyClaim({ kind: "dep", package: "next" }, populatedCtx).status
    ).toBe("verified");
  });

  it("dispatches file", () => {
    expect(
      verifyClaim({ kind: "file", glob: "Dockerfile" }, populatedCtx).status
    ).toBe("verified");
  });

  it("dispatches workflow", () => {
    expect(
      verifyClaim(
        { kind: "workflow", category: "test" },
        populatedCtx
      ).status
    ).toBe("verified");
  });

  it("dispatches grep", () => {
    expect(
      verifyClaim(
        { kind: "grep", pattern: "JWT", sources: ["readme"] },
        populatedCtx
      ).status
    ).toBe("verified");
  });

  it("returns flagged for every kind against an empty context", () => {
    for (const spec of [
      { kind: "dep" as const, package: "x" },
      { kind: "file" as const, glob: "x" },
      { kind: "workflow" as const, category: "test" as const },
      { kind: "grep" as const, pattern: "x", sources: ["readme" as const] },
    ]) {
      expect(verifyClaim(spec, emptyCtx).status).toBe("flagged");
    }
  });

  it("never throws — verifier errors become flagged", () => {
    // Force a bad state to see if the catch-all works: pass a deliberately
    // malformed spec that slips past TypeScript via cast.
    const r = verifyClaim(
      { kind: "grep", pattern: null as any, sources: ["readme"] },
      populatedCtx
    );
    expect(r.status).toBe("flagged");
  });
});
