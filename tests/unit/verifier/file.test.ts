import { globToRegex, verifyFile } from "@/lib/pipeline/verifier/file";

const TREE = [
  "Dockerfile",
  "package.json",
  "README.md",
  "src/index.ts",
  "src/lib/auth.ts",
  "src/lib/auth/helpers.ts",
  "tests/integration/foo.test.ts",
  ".github/workflows/ci.yml",
  ".github/workflows/deploy.yml",
];

describe("globToRegex", () => {
  it("matches exact filenames", () => {
    expect(globToRegex("Dockerfile").test("Dockerfile")).toBe(true);
    expect(globToRegex("Dockerfile").test("Dockerfile.dev")).toBe(false);
  });

  it("matches single-segment wildcard with *", () => {
    expect(globToRegex("*.md").test("README.md")).toBe(true);
    expect(globToRegex("*.md").test("docs/README.md")).toBe(false); // top-level only
  });

  it("matches cross-directory with **", () => {
    expect(globToRegex("tests/**").test("tests/integration/foo.test.ts")).toBe(
      true
    );
    expect(globToRegex("tests/**").test("tests/foo.test.ts")).toBe(true);
    expect(globToRegex("tests/**").test("src/tests/foo.test.ts")).toBe(false);
  });

  it("escapes regex metacharacters in literal segments", () => {
    expect(globToRegex("package.json").test("package.json")).toBe(true);
    expect(globToRegex("package.json").test("packageXjson")).toBe(false);
  });

  it("? matches exactly one non-slash char", () => {
    expect(globToRegex("src/?.ts").test("src/a.ts")).toBe(true);
    expect(globToRegex("src/?.ts").test("src/ab.ts")).toBe(false);
  });
});

describe("verifyFile", () => {
  it("verifies an exact file match", () => {
    const r = verifyFile({ kind: "file", glob: "Dockerfile" }, TREE);
    expect(r.status).toBe("verified");
    expect(r.evidence).toBe("Dockerfile");
  });

  it("verifies a recursive glob", () => {
    const r = verifyFile({ kind: "file", glob: "tests/**" }, TREE);
    expect(r.status).toBe("verified");
  });

  it("verifies .github/workflows/*.yml", () => {
    const r = verifyFile(
      { kind: "file", glob: ".github/workflows/*.yml" },
      TREE
    );
    expect(r.status).toBe("verified");
  });

  it("flags a pattern that matches no file", () => {
    const r = verifyFile({ kind: "file", glob: "Makefile" }, TREE);
    expect(r.status).toBe("flagged");
    expect(r.evidence).toMatch(/No file matched/);
  });

  it("flags when tree is empty", () => {
    const r = verifyFile({ kind: "file", glob: "anything" }, []);
    expect(r.status).toBe("flagged");
  });
});
