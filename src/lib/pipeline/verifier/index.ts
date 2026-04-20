import type { VerifierSpec } from "@/lib/ai/schemas/storyboard";
import { verifyDep, type ParsedDep } from "@/lib/pipeline/verifier/dep";
import {
  verifyFile,
  type VerifierResult,
} from "@/lib/pipeline/verifier/file";
import {
  verifyWorkflow,
  type ClassifiedWorkflow,
} from "@/lib/pipeline/verifier/workflow";
import {
  verifyGrep,
  type SourceBlobs,
} from "@/lib/pipeline/verifier/grep";

export type { VerifierResult, ParsedDep, ClassifiedWorkflow, SourceBlobs };

export interface VerifierContext {
  depsParsed: ParsedDep[];
  fileTreePaths: string[];
  workflows: ClassifiedWorkflow[];
  sourceBlobs: SourceBlobs;
}

/**
 * Dispatch a {@link VerifierSpec} against a {@link VerifierContext}.
 *
 * Never throws — errors become `flagged` with an evidence string. This is
 * load-bearing: the storyboard step runs the verifier over every claim,
 * and a verifier crash must not cascade to the pipeline.
 */
export function verifyClaim(
  spec: VerifierSpec,
  ctx: VerifierContext
): VerifierResult {
  try {
    switch (spec.kind) {
      case "dep":
        return verifyDep(spec, ctx.depsParsed);
      case "file":
        return verifyFile(spec, ctx.fileTreePaths);
      case "workflow":
        return verifyWorkflow(spec, ctx.workflows);
      case "grep":
        return verifyGrep(spec, ctx.sourceBlobs);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: "flagged", evidence: `Verifier error: ${msg}` };
  }
}
