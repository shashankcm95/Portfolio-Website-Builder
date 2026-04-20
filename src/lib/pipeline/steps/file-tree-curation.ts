import { globToRegex } from "@/lib/pipeline/verifier/file";

/**
 * Curate a full repo file tree into the small subset worth feeding to the
 * storyboard prompt. Full trees are huge and noisy (node_modules, generated
 * artifacts, framework scaffolding), and they blow up the token budget.
 *
 * Rules (applied in order, de-duplicated, capped at `MAX_ENTRIES`):
 *
 * 1. **Always keep top-level files and 2-deep directory entries** — the
 *    recognizable shape of the repo.
 * 2. **Always keep files matching "important globs"** — tests, CI,
 *    package manifests, Docker, infrastructure-as-code.
 * 3. **Always keep paths the LLM's context pack already flagged** as
 *    key features (via `keyFeaturePaths`) — our best guess at what's
 *    interesting to surface.
 * 4. **Then pad up to the cap with the first N `src/**` entries** —
 *    likely-authored code.
 * 5. **Never include** matches in the "ignore globs" list
 *    (node_modules, .next, dist, build, coverage, etc.).
 */
export const MAX_ENTRIES = 150;

const IMPORTANT_GLOBS = [
  "tests/**",
  "**/test*",
  "**/*.test.*",
  "**/*.spec.*",
  ".github/workflows/**",
  "Dockerfile",
  "docker-compose.*",
  "Makefile",
  "package.json",
  "requirements.txt",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "Gemfile",
  "pom.xml",
  "build.gradle",
  "composer.json",
  "README.md",
  "README.*",
  "tsconfig.json",
  "jest.config.*",
  "vitest.config.*",
  "playwright.config.*",
  "next.config.*",
  "vite.config.*",
];

const IGNORE_GLOBS = [
  "node_modules/**",
  ".next/**",
  "dist/**",
  "build/**",
  "coverage/**",
  ".turbo/**",
  ".cache/**",
  "**/*.min.js",
  "**/*.lock",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "Cargo.lock",
  "**/*.map",
];

export interface CurateOptions {
  /** Paths explicitly flagged as interesting (from contextPack.keyFeatures). */
  keyFeaturePaths?: string[];
  /** Override the max for tests. */
  max?: number;
}

export function curateFileTree(
  allPaths: string[],
  options: CurateOptions = {}
): string[] {
  const max = options.max ?? MAX_ENTRIES;
  const ignoreRx = IGNORE_GLOBS.map(globToRegex);
  const importantRx = IMPORTANT_GLOBS.map(globToRegex);
  const keyRx = (options.keyFeaturePaths ?? []).map(globToRegex);

  const isIgnored = (p: string) => ignoreRx.some((rx) => rx.test(p));
  const isImportant = (p: string) => importantRx.some((rx) => rx.test(p));
  const isKey = (p: string) => keyRx.some((rx) => rx.test(p));

  // De-dupe and filter ignored paths once
  const candidates = Array.from(new Set(allPaths)).filter((p) => !isIgnored(p));

  const kept = new Set<string>();
  const add = (p: string) => {
    if (kept.size >= max) return;
    kept.add(p);
  };

  // 1. Top-level files + 2-deep dir entries (shape of the repo)
  for (const p of candidates) {
    const depth = p.split("/").length;
    if (depth <= 2) add(p);
  }

  // 2. Important files at any depth
  for (const p of candidates) {
    if (isImportant(p)) add(p);
  }

  // 3. Key-feature paths
  for (const p of candidates) {
    if (isKey(p)) add(p);
  }

  // 4. Pad with src/** entries (first-arrived)
  for (const p of candidates) {
    if (kept.size >= max) break;
    if (p.startsWith("src/")) add(p);
  }

  return Array.from(kept);
}
