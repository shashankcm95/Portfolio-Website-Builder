import type { DependencyFile } from "@/lib/github/repo-fetcher";
import { detectTechStack } from "@/lib/github/tech-detector";
import type { TestFrameworkName } from "@/lib/credibility/types";

/**
 * Surface the *verified* stack (subset of tech-detector's output) as a flat
 * list of display names. This is what the credibility badge row renders as
 * "Detected stack: Next.js, Drizzle ORM, Zod".
 *
 * We intentionally narrow to frameworks + libraries (not "tool" chain bits
 * like Webpack or "language" like TypeScript) — recruiters care about what
 * the project *uses*, not what tooling compiles it.
 */
export function extractVerifiedStack(
  dependencies: DependencyFile[]
): string[] {
  const detected = detectTechStack(dependencies);
  return detected
    .filter((t) => t.category === "framework" || t.category === "library")
    .map((t) => t.name);
}

// ─── Test-framework detection ───────────────────────────────────────────────

/**
 * Map package/module names → normalized framework ID. Ordering inside each
 * ecosystem doesn't matter; across ecosystems we pick the first match.
 * Rationale for first-match: a JS repo that also has a Python `requirements.txt`
 * (rare, but happens for tooling) should still report as "jest" — the primary
 * language wins.
 */
const TEST_FRAMEWORK_BY_PACKAGE: Record<string, TestFrameworkName> = {
  jest: "jest",
  "@jest/core": "jest",
  vitest: "vitest",
  mocha: "mocha",
  pytest: "pytest",
};

/**
 * Cargo and Go include test runners in the standard toolchain — we detect
 * by ecosystem presence, not package name.
 */
export function detectTestFramework(
  dependencies: DependencyFile[]
): TestFrameworkName | null {
  // Priority 1: explicit package match (JS/TS/Python).
  for (const dep of dependencies) {
    const content = dep.content ?? "";
    if (dep.type === "package_json") {
      try {
        const parsed = JSON.parse(content) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        const allDeps = {
          ...(parsed.dependencies ?? {}),
          ...(parsed.devDependencies ?? {}),
        };
        for (const pkg of Object.keys(allDeps)) {
          if (TEST_FRAMEWORK_BY_PACKAGE[pkg]) {
            return TEST_FRAMEWORK_BY_PACKAGE[pkg];
          }
        }
      } catch {
        // Malformed package.json — fall through.
      }
    }

    if (dep.type === "requirements_txt" || dep.type === "pipfile") {
      // Simple substring check — pytest on a line like "pytest>=7.0" or "pytest = "*"".
      if (/(^|\n)\s*pytest\b/i.test(content)) {
        return "pytest";
      }
    }

    if (dep.type === "pyproject_toml") {
      if (/(^|\n)\s*pytest\b/i.test(content)) return "pytest";
    }
  }

  // Priority 2: ecosystem-implicit test runners.
  const hasCargo = dependencies.some((d) => d.type === "cargo_toml");
  if (hasCargo) return "cargo-test";

  const hasGoMod = dependencies.some((d) => d.type === "go_mod");
  if (hasGoMod) return "go-test";

  return null;
}
