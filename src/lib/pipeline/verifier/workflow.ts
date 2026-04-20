import type { VerifierSpec } from "@/lib/ai/schemas/storyboard";
import type { WorkflowCategory } from "@/lib/credibility/types";
import type { VerifierResult } from "@/lib/pipeline/verifier/file";

type WorkflowVerifierSpec = Extract<VerifierSpec, { kind: "workflow" }>;

export interface ClassifiedWorkflow {
  name: string;
  category: WorkflowCategory;
}

/**
 * Workflow-category verifier. Confirms the repo has at least one active
 * GitHub Actions workflow in the given category.
 *
 * The classification is already done for us upstream by
 * {@link classifyWorkflow} during credibility-signals fetching; this
 * verifier just checks the resulting list.
 */
export function verifyWorkflow(
  spec: WorkflowVerifierSpec,
  workflows: ClassifiedWorkflow[]
): VerifierResult {
  const match = workflows.find((w) => w.category === spec.category);
  if (match) {
    return {
      status: "verified",
      evidence: `${match.name} (${spec.category})`,
    };
  }
  return {
    status: "flagged",
    evidence: `No workflow classified as '${spec.category}'`,
  };
}
