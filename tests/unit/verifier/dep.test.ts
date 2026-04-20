import { verifyDep } from "@/lib/pipeline/verifier/dep";

describe("verifyDep", () => {
  const deps = [
    { name: "drizzle-orm", ecosystem: "npm" },
    { name: "next", ecosystem: "npm" },
    { name: "pytest", ecosystem: "pypi" },
  ];

  it("returns verified for a direct name match", () => {
    const r = verifyDep({ kind: "dep", package: "drizzle-orm" }, deps);
    expect(r.status).toBe("verified");
    expect(r.evidence).toMatch(/drizzle-orm/);
  });

  it("is case-insensitive", () => {
    const r = verifyDep({ kind: "dep", package: "DRIZZLE-ORM" }, deps);
    expect(r.status).toBe("verified");
  });

  it("honors ecosystem when specified", () => {
    const r = verifyDep(
      { kind: "dep", package: "pytest", ecosystem: "pypi" },
      deps
    );
    expect(r.status).toBe("verified");
  });

  it("flags a cross-ecosystem mismatch", () => {
    const r = verifyDep(
      { kind: "dep", package: "pytest", ecosystem: "npm" },
      deps
    );
    expect(r.status).toBe("flagged");
  });

  it("flags an unknown package", () => {
    const r = verifyDep({ kind: "dep", package: "does-not-exist" }, deps);
    expect(r.status).toBe("flagged");
    expect(r.evidence).toMatch(/not found/i);
  });

  it("flags when deps list is empty", () => {
    const r = verifyDep({ kind: "dep", package: "react" }, []);
    expect(r.status).toBe("flagged");
  });
});
