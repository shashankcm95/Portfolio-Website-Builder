import type { VerifierSpec } from "@/lib/ai/schemas/storyboard";
import type { VerifierResult } from "@/lib/pipeline/verifier/file";

type GrepVerifierSpec = Extract<VerifierSpec, { kind: "grep" }>;

export type SourceBlobs = Partial<
  Record<"readme" | "file_tree" | "dependencies", string>
>;

/**
 * Regex-in-sources verifier. Compiles the LLM-supplied `pattern` as a
 * case-insensitive regex and searches each requested source blob.
 *
 * Safety: the pattern is user-supplied (from LLM output), so we
 *   (a) cap compiled regex length at 200 chars
 *   (b) reject any pattern that produces an invalid RegExp
 *   (c) limit the match attempt to the first 50 KB of each blob to avoid
 *       pathological ReDoS cases on large README/file-tree content.
 */
const MAX_PATTERN_LEN = 200;
const MAX_BLOB_SCAN = 50_000;

export function verifyGrep(
  spec: GrepVerifierSpec,
  sources: SourceBlobs
): VerifierResult {
  if (spec.pattern.length > MAX_PATTERN_LEN) {
    return {
      status: "flagged",
      evidence: `Pattern too long (${spec.pattern.length} > ${MAX_PATTERN_LEN})`,
    };
  }

  let rx: RegExp;
  try {
    rx = new RegExp(spec.pattern, "i");
  } catch (e) {
    return {
      status: "flagged",
      evidence: `Invalid regex: ${(e as Error).message}`,
    };
  }

  for (const source of spec.sources) {
    const blob = sources[source];
    if (!blob) continue;
    const haystack = blob.slice(0, MAX_BLOB_SCAN);
    const m = haystack.match(rx);
    if (m) {
      return {
        status: "verified",
        evidence: `Matched in ${source}: "${truncate(m[0], 60)}"`,
      };
    }
  }

  return {
    status: "flagged",
    evidence: `Pattern '${spec.pattern}' not found in ${spec.sources.join(", ")}`,
  };
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
