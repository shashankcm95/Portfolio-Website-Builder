import {
  curateFileTree,
  MAX_ENTRIES,
} from "@/lib/pipeline/steps/file-tree-curation";

describe("curateFileTree", () => {
  it("returns empty for empty input", () => {
    expect(curateFileTree([])).toEqual([]);
  });

  it("always includes top-level files", () => {
    const result = curateFileTree([
      "README.md",
      "package.json",
      "src/index.ts",
      "src/deep/very/nested/file.ts",
    ]);
    expect(result).toEqual(
      expect.arrayContaining(["README.md", "package.json", "src/index.ts"])
    );
  });

  it("excludes node_modules and lockfiles", () => {
    const result = curateFileTree([
      "package.json",
      "node_modules/react/index.js",
      "package-lock.json",
      "pnpm-lock.yaml",
      "src/foo.js.map",
    ]);
    expect(result).not.toContain("node_modules/react/index.js");
    expect(result).not.toContain("package-lock.json");
    expect(result).not.toContain("pnpm-lock.yaml");
    expect(result).not.toContain("src/foo.js.map");
  });

  it("always keeps CI workflows even when deep", () => {
    const result = curateFileTree([
      ".github/workflows/ci.yml",
      ".github/workflows/deploy.yml",
    ]);
    expect(result).toContain(".github/workflows/ci.yml");
    expect(result).toContain(".github/workflows/deploy.yml");
  });

  it("always keeps test files even when deep", () => {
    const result = curateFileTree([
      "tests/integration/auth/login.test.ts",
      "tests/unit/helpers/format.test.ts",
    ]);
    expect(result).toContain("tests/integration/auth/login.test.ts");
    expect(result).toContain("tests/unit/helpers/format.test.ts");
  });

  it("respects the MAX_ENTRIES cap", () => {
    // Generate many src files; curation should cap.
    const paths = Array.from({ length: 500 }, (_, i) => `src/module${i}.ts`);
    const result = curateFileTree(paths);
    expect(result.length).toBeLessThanOrEqual(MAX_ENTRIES);
  });

  it("includes paths from keyFeaturePaths", () => {
    const result = curateFileTree(
      [
        "src/lib/deep/auth.ts",
        "src/index.ts",
      ],
      { keyFeaturePaths: ["src/lib/deep/*.ts"] }
    );
    expect(result).toContain("src/lib/deep/auth.ts");
  });

  it("de-duplicates repeated paths", () => {
    const result = curateFileTree([
      "package.json",
      "package.json",
      "README.md",
    ]);
    const counts = result.filter((p) => p === "package.json").length;
    expect(counts).toBe(1);
  });

  it("honors custom max for test scenarios", () => {
    const paths = Array.from({ length: 50 }, (_, i) => `src/m${i}.ts`);
    const result = curateFileTree(paths, { max: 10 });
    expect(result.length).toBeLessThanOrEqual(10);
  });
});
