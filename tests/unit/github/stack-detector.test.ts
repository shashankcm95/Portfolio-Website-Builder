import {
  detectTestFramework,
  extractVerifiedStack,
} from "@/lib/github/stack-detector";
import type { DependencyFile } from "@/lib/github/repo-fetcher";

function packageJson(contents: object): DependencyFile {
  return {
    type: "package_json",
    path: "package.json",
    content: JSON.stringify(contents),
  };
}

// ─── extractVerifiedStack ───────────────────────────────────────────────────

describe("extractVerifiedStack", () => {
  it("surfaces frameworks and libraries but drops tooling and language entries", () => {
    const deps: DependencyFile[] = [
      packageJson({
        dependencies: { next: "14.0.0", "drizzle-orm": "0.38.0", zod: "3.0.0" },
        devDependencies: { typescript: "5.0.0", vite: "5.0.0" },
      }),
    ];
    const stack = extractVerifiedStack(deps);
    // Frameworks + libraries should appear
    expect(stack).toEqual(expect.arrayContaining(["Next.js", "Drizzle ORM", "Zod"]));
    // Language/tool entries are excluded
    expect(stack).not.toContain("TypeScript");
    expect(stack).not.toContain("Vite");
  });

  it("returns empty array for empty input", () => {
    expect(extractVerifiedStack([])).toEqual([]);
  });

  it("de-duplicates when the same framework appears across dep files", () => {
    const deps: DependencyFile[] = [
      packageJson({ dependencies: { react: "18.0.0" } }),
      packageJson({ dependencies: { "react-dom": "18.0.0" } }),
    ];
    const stack = extractVerifiedStack(deps);
    expect(stack.filter((s) => s === "React")).toHaveLength(1);
  });
});

// ─── detectTestFramework ────────────────────────────────────────────────────

describe("detectTestFramework", () => {
  it("returns null for empty deps", () => {
    expect(detectTestFramework([])).toBeNull();
  });

  it("detects Jest from devDependencies", () => {
    const deps = [packageJson({ devDependencies: { jest: "29.0.0" } })];
    expect(detectTestFramework(deps)).toBe("jest");
  });

  it("detects Vitest from devDependencies", () => {
    const deps = [packageJson({ devDependencies: { vitest: "1.0.0" } })];
    expect(detectTestFramework(deps)).toBe("vitest");
  });

  it("detects Mocha from devDependencies", () => {
    const deps = [packageJson({ devDependencies: { mocha: "10.0.0" } })];
    expect(detectTestFramework(deps)).toBe("mocha");
  });

  it("detects pytest from requirements.txt", () => {
    const deps: DependencyFile[] = [
      {
        type: "requirements_txt",
        path: "requirements.txt",
        content: "flask==2.0\npytest>=7.0\nrequests",
      },
    ];
    expect(detectTestFramework(deps)).toBe("pytest");
  });

  it("detects pytest from pyproject.toml", () => {
    const deps: DependencyFile[] = [
      {
        type: "pyproject_toml",
        path: "pyproject.toml",
        content: `[tool.pytest.ini_options]\nminversion = "6.0"\npytest = "^7.0"`,
      },
    ];
    expect(detectTestFramework(deps)).toBe("pytest");
  });

  it("detects cargo-test when a Cargo.toml is present", () => {
    const deps: DependencyFile[] = [
      {
        type: "cargo_toml",
        path: "Cargo.toml",
        content: '[package]\nname = "demo"',
      },
    ];
    expect(detectTestFramework(deps)).toBe("cargo-test");
  });

  it("detects go-test when a go.mod is present", () => {
    const deps: DependencyFile[] = [
      { type: "go_mod", path: "go.mod", content: "module demo\ngo 1.22" },
    ];
    expect(detectTestFramework(deps)).toBe("go-test");
  });

  it("tolerates malformed package.json without throwing", () => {
    const deps: DependencyFile[] = [
      {
        type: "package_json",
        path: "package.json",
        content: "{ not json",
      },
    ];
    expect(detectTestFramework(deps)).toBeNull();
  });

  it("prefers an explicit framework over a fallback ecosystem", () => {
    // JS repo with both package.json (jest) and an incidental go.mod
    // (e.g. a tool written in Go) should still report Jest.
    const deps: DependencyFile[] = [
      packageJson({ devDependencies: { jest: "29.0.0" } }),
      { type: "go_mod", path: "go.mod", content: "module demo" },
    ];
    expect(detectTestFramework(deps)).toBe("jest");
  });
});
