import type { VerifierSpec } from "@/lib/ai/schemas/storyboard";

type FileVerifierSpec = Extract<VerifierSpec, { kind: "file" }>;

export interface VerifierResult {
  status: "verified" | "flagged";
  evidence?: string;
}

/**
 * File-existence verifier. Checks whether any path in the repo's file tree
 * matches the given glob.
 *
 * Supported glob syntax (deliberately minimal — the LLM emits simple
 * patterns and we don't want brace/extglob edge cases):
 *   `*`  — any run of non-`/` chars
 *   `**` — any run including `/`
 *   `?`  — exactly one non-`/` char
 *   literal path segments
 *
 * Examples:
 *   `Dockerfile`              → match exactly "Dockerfile"
 *   `tests/**`                → any file under tests/
 *   `.github/workflows/*.yml` → any yml directly in workflows/
 *   `*.ts`                    → top-level .ts files only
 */
export function verifyFile(
  spec: FileVerifierSpec,
  fileTreePaths: string[]
): VerifierResult {
  const rx = globToRegex(spec.glob);
  const match = fileTreePaths.find((p) => rx.test(p));
  if (match) {
    return { status: "verified", evidence: match };
  }
  return {
    status: "flagged",
    evidence: `No file matched '${spec.glob}'`,
  };
}

/**
 * Convert our minimal glob grammar to a single RegExp. Exported so the
 * file-tree curation util can reuse it for path filtering.
 */
export function globToRegex(glob: string): RegExp {
  // Escape regex metacharacters except the ones we interpret
  let pattern = "";
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        pattern += ".*"; // ** matches anything including /
        i += 2;
      } else {
        pattern += "[^/]*"; // * matches anything except /
        i += 1;
      }
    } else if (c === "?") {
      pattern += "[^/]";
      i += 1;
    } else if (/[.+^$(){}|[\]\\]/.test(c)) {
      pattern += "\\" + c;
      i += 1;
    } else {
      pattern += c;
      i += 1;
    }
  }
  return new RegExp(`^${pattern}$`);
}
