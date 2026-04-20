import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, repoSources } from "@/lib/db/schema";
import { classifyWorkflow } from "@/lib/github/workflow-classifier";
import type {
  CredibilitySignals,
  StoredCredibilitySignals,
} from "@/lib/credibility/types";
import type {
  ClassifiedWorkflow,
  ParsedDep,
  SourceBlobs,
  VerifierContext,
} from "@/lib/pipeline/verifier";

/**
 * Build a {@link VerifierContext} from what's already in the database for
 * a given project. Runs once per storyboard generation.
 *
 * Inputs pulled:
 *  - repo_sources (type=dependencies) → parse names → deps list
 *  - repo_sources (type=file_tree) → path list
 *  - projects.credibility_signals → workflow categories (from Phase 1)
 *  - repo_sources for the grep source-blob map (readme / file_tree / deps)
 */
export async function buildVerifierContext(
  projectId: string
): Promise<VerifierContext> {
  const [sourceRows, projectRow] = await Promise.all([
    db
      .select()
      .from(repoSources)
      .where(eq(repoSources.projectId, projectId)),
    db.select().from(projects).where(eq(projects.id, projectId)).limit(1),
  ]);

  // ─── Source blobs (for grep + tree + deps) ───
  const sourceBlobs: SourceBlobs = {};
  const depsContent: string[] = [];
  for (const row of sourceRows) {
    const content = row.content ?? "";
    if (row.sourceType === "readme") sourceBlobs.readme = content;
    else if (row.sourceType === "file_tree") {
      sourceBlobs.file_tree = content;
    } else if (
      row.sourceType === "package_json" ||
      row.sourceType === "requirements_txt" ||
      row.sourceType === "pipfile" ||
      row.sourceType === "pyproject_toml" ||
      row.sourceType === "cargo_toml" ||
      row.sourceType === "go_mod" ||
      row.sourceType === "gemfile" ||
      row.sourceType === "pom_xml" ||
      row.sourceType === "build_gradle" ||
      row.sourceType === "composer_json"
    ) {
      depsContent.push(content);
    }
  }
  sourceBlobs.dependencies = depsContent.join("\n");

  // ─── File-tree paths ───
  const fileTreePaths = parseFileTreePaths(sourceBlobs.file_tree ?? "");

  // ─── Parsed deps (name + ecosystem) ───
  const depsParsed: ParsedDep[] = [];
  for (const row of sourceRows) {
    const eco = ecosystemFor(row.sourceType);
    if (!eco) continue;
    depsParsed.push(
      ...extractDepNames(row.sourceType, row.content ?? "").map((name) => ({
        name,
        ecosystem: eco,
      }))
    );
  }

  // ─── Workflow categories from credibility signals ───
  const project = projectRow[0];
  const credSignals = (project?.credibilitySignals ?? null) as
    | CredibilitySignals
    | StoredCredibilitySignals
    | null;

  const workflows: ClassifiedWorkflow[] = [];
  if (credSignals?.workflows?.status === "ok") {
    // Signals store aggregate category counts, not individual names — we
    // synthesize one placeholder workflow per non-zero category so the
    // verifier can match.
    for (const [cat, count] of Object.entries(
      credSignals.workflows.categories
    )) {
      if (count > 0) {
        workflows.push({
          name: `${cat} workflow`,
          category: cat as ClassifiedWorkflow["category"],
        });
      }
    }
  }

  // If the signals happen to be absent (e.g. credibility fetch failed),
  // fall back to classifying any workflow-like strings we can find in the
  // file tree.
  if (workflows.length === 0) {
    for (const path of fileTreePaths) {
      if (path.startsWith(".github/workflows/") && path.endsWith(".yml")) {
        const name = path.split("/").pop() ?? path;
        workflows.push({
          name,
          category: classifyWorkflow(name, path),
        });
      }
    }
  }

  return {
    depsParsed,
    fileTreePaths,
    workflows,
    sourceBlobs,
  };
}

// ─── Internals ──────────────────────────────────────────────────────────────

/**
 * The `file_tree` source is stored as a JSON-stringified array of
 * `{ path, type, size? }` from {@link RepoFetcher}. Fall back to
 * newline-split in case a different serialization shows up.
 */
function parseFileTreePaths(blob: string): string[] {
  if (!blob) return [];
  try {
    const parsed = JSON.parse(blob);
    if (Array.isArray(parsed)) {
      return parsed
        .map((e) => (typeof e === "string" ? e : e?.path))
        .filter(
          (p): p is string => typeof p === "string" && p.length > 0
        );
    }
  } catch {
    // not JSON — fall through
  }
  return blob
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function ecosystemFor(type: string): string | null {
  switch (type) {
    case "package_json":
      return "npm";
    case "requirements_txt":
    case "pipfile":
    case "pyproject_toml":
      return "pypi";
    case "cargo_toml":
      return "cargo";
    case "go_mod":
      return "go";
    case "gemfile":
      return "rubygems";
    case "pom_xml":
    case "build_gradle":
      return "maven";
    case "composer_json":
      return "composer";
    default:
      return null;
  }
}

/**
 * Extract dep names from a manifest. Intentionally lightweight — we only
 * need the NAMES, not versions or classifications (tech-detector already
 * does the heavy lifting for the stack display).
 */
function extractDepNames(type: string, content: string): string[] {
  try {
    if (type === "package_json") {
      const pkg = JSON.parse(content) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
      };
      return Array.from(
        new Set([
          ...Object.keys(pkg.dependencies ?? {}),
          ...Object.keys(pkg.devDependencies ?? {}),
          ...Object.keys(pkg.peerDependencies ?? {}),
        ])
      );
    }
    if (type === "requirements_txt") {
      return content
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
        .map((l) => l.split(/[=<>!~\s]/)[0])
        .filter(Boolean);
    }
    if (type === "cargo_toml") {
      // naive: look for lines like `name = "..."` under [dependencies] or
      // `foo = "1.0"` entries. Without a full TOML parser we do a best-effort.
      const names: string[] = [];
      const depSectionMatch = content.match(
        /\[(?:dev-)?dependencies\][\s\S]*?(?=\[\w|$)/g
      );
      for (const section of depSectionMatch ?? []) {
        for (const line of section.split("\n")) {
          const m = line.match(/^\s*([A-Za-z0-9_-]+)\s*=/);
          if (m) names.push(m[1]);
        }
      }
      return names;
    }
    if (type === "go_mod") {
      const names: string[] = [];
      for (const line of content.split("\n")) {
        const m = line.match(/^\s*([\w./-]+)\s+v\d/);
        if (m) names.push(m[1]);
      }
      return names;
    }
    if (type === "pyproject_toml" || type === "pipfile") {
      // Best-effort: pull [name] = "..." style keys
      const names: string[] = [];
      for (const line of content.split("\n")) {
        const m = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*["{]/);
        if (m) names.push(m[1]);
      }
      return names;
    }
  } catch {
    // malformed — return empty
  }
  return [];
}
