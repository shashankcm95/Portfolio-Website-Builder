import type {
  DepVerifier,
  FileVerifier,
  GrepVerifier,
  VerifierSpec,
  WorkflowVerifier,
} from "@/lib/ai/schemas/storyboard";
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
        if (!spec.package) {
          return {
            status: "flagged",
            evidence: "dep verifier is missing `package`",
          };
        }
        return verifyDep(
          { kind: "dep", package: spec.package, ecosystem: spec.ecosystem } as DepVerifier,
          ctx.depsParsed
        );
      case "file":
        if (!spec.glob) {
          return {
            status: "flagged",
            evidence: "file verifier is missing `glob`",
          };
        }
        return verifyFile(
          { kind: "file", glob: spec.glob } as FileVerifier,
          ctx.fileTreePaths
        );
      case "workflow":
        if (!spec.category) {
          return {
            status: "flagged",
            evidence: "workflow verifier is missing `category`",
          };
        }
        return verifyWorkflow(
          { kind: "workflow", category: spec.category } as WorkflowVerifier,
          ctx.workflows
        );
      case "grep":
        if (!spec.pattern || !spec.sources?.length) {
          return {
            status: "flagged",
            evidence: "grep verifier is missing `pattern` or `sources`",
          };
        }
        return verifyGrep(
          {
            kind: "grep",
            pattern: spec.pattern,
            sources: spec.sources,
          } as GrepVerifier,
          ctx.sourceBlobs
        );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: "flagged", evidence: `Verifier error: ${msg}` };
  }
}
