import type { DepVerifier } from "@/lib/ai/schemas/storyboard";
import type { VerifierResult } from "@/lib/pipeline/verifier/file";

// Phase 7 — the per-kind narrow type lives in the schemas file now
// because the flat `VerifierSpec` (OpenAI strict-mode shape) no
// longer supports `Extract<VerifierSpec, { kind: "dep" }>`.
type DepVerifierSpec = DepVerifier;

export interface ParsedDep {
  name: string;
  /** "npm" | "pypi" | "cargo" | "go" | other */
  ecosystem: string;
}

/**
 * Package-in-dependencies verifier. Case-insensitive name match against
 * the parsed dependencies list (built from package.json, requirements.txt,
 * Cargo.toml, go.mod via existing stack-detector).
 *
 * If `ecosystem` is specified on the spec, match is scoped to that ecosystem.
 * Otherwise any ecosystem counts.
 */
export function verifyDep(
  spec: DepVerifierSpec,
  deps: ParsedDep[]
): VerifierResult {
  const needle = spec.package.toLowerCase();
  const match = deps.find((d) => {
    if (spec.ecosystem && d.ecosystem !== spec.ecosystem) return false;
    return d.name.toLowerCase() === needle;
  });
  if (match) {
    return {
      status: "verified",
      evidence: `${match.name} in ${match.ecosystem} dependencies`,
    };
  }
  return {
    status: "flagged",
    evidence: `Package '${spec.package}' not found in dependencies`,
  };
}
