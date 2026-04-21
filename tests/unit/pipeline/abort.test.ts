/**
 * @jest-environment node
 *
 * Phase 10, Track D — cancellation during a running pipeline step.
 *
 * The real step entry points honour an `AbortSignal` by throwing a
 * `PipelineAbortError` at every LLM/network boundary. Here we stub the
 * first step (`resume_parse`) with a controllable gate, fire
 * `cancelPipeline()` while it's in flight, and assert:
 *
 *  1. the orchestrator writes `pipelineStatus = "cancelled"` +
 *     `pipelineError = "Cancelled by owner"` to the `projects` row;
 *  2. subsequent steps don't run.
 */

// ─── Mocks ─────────────────────────────────────────────────────────────────

// All downstream "update(projects).set({ ... })" calls funnel through this
// spy so we can assert the final cancellation status write.
const mockProjectsSet = jest.fn(() => ({ where: jest.fn() }));
const mockProjectsUpdate = jest.fn(() => ({ set: mockProjectsSet }));
const mockInsert = jest.fn(() => ({
  values: jest.fn(() => ({
    onConflictDoUpdate: jest.fn(() => ({ returning: jest.fn(async () => []) })),
    returning: jest.fn(async () => []),
  })),
}));
const mockSelect = jest.fn(() => {
  const self: any = {
    from: () => self,
    where: () => self,
    limit: async () => [],
    innerJoin: () => self,
  };
  return self;
});
const mockDelete = jest.fn(() => ({ where: jest.fn(async () => undefined) }));

jest.mock("@/lib/db", () => ({
  db: {
    select: (...a: unknown[]) => mockSelect(...a),
    insert: (...a: unknown[]) => mockInsert(...a),
    update: (...a: unknown[]) => mockProjectsUpdate(...a),
    delete: (...a: unknown[]) => mockDelete(...a),
  },
}));

jest.mock("drizzle-orm", () => {
  const actual = jest.requireActual("drizzle-orm");
  return { ...actual, eq: jest.fn(() => "eq"), and: jest.fn(() => "and") };
});

// History + queue modules are no-ops for this test.
jest.mock("@/lib/pipeline/history", () => ({
  recordJobStart: jest.fn(),
  recordJobFinish: jest.fn(),
  recordStepStart: jest.fn(),
  recordStepFinish: jest.fn(),
}));
jest.mock("@/lib/pipeline/queue", () => ({
  enqueueJob: jest.fn(() => "job-1"),
  updateJob: jest.fn(),
}));

// Stub the LLM factory so the orchestrator doesn't try to resolve a key.
jest.mock("@/lib/ai/providers/factory", () => ({
  getLlmClientForProject: jest.fn(async () => ({
    text: jest.fn(),
    structured: jest.fn(),
  })),
}));

// Gate: resolves once the test fires `releaseStep()`. Lets us synchronise
// the `cancelPipeline` call with an in-flight step.
let releaseStep: () => void;
const stepGate = new Promise<void>((resolve) => {
  releaseStep = resolve;
});

const mockParseResume = jest.fn(async (_buf: Buffer, _mime: string, signal?: AbortSignal) => {
  // Simulate a long-running LLM-style call. Await either the external
  // release (normal completion) or the signal firing (cancellation).
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      const { PipelineAbortError } = require("@/lib/pipeline/abort");
      reject(new PipelineAbortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    stepGate.then(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    });
  });
  return { rawText: "", wordCount: 0 };
});
jest.mock("@/lib/pipeline/steps/resume-parse", () => ({
  parseResume: (...a: unknown[]) => mockParseResume(...(a as [Buffer, string, AbortSignal?])),
}));

// All later steps should be no-ops, and crucially should NOT execute after
// cancellation — assert the call count at the end.
const mockStructureResume = jest.fn();
jest.mock("@/lib/pipeline/steps/resume-structure", () => ({
  structureResume: (...a: unknown[]) => mockStructureResume(...a),
}));
jest.mock("@/lib/pipeline/steps/context-generate", () => ({
  generateContextPack: jest.fn(),
}));
jest.mock("@/lib/pipeline/steps/fact-extract", () => ({
  extractFacts: jest.fn(),
}));
jest.mock("@/lib/pipeline/steps/narrative-generate", () => ({
  generateNarratives: jest.fn(),
}));
jest.mock("@/lib/pipeline/steps/claim-verify", () => ({
  verifyClaims: jest.fn(),
}));
jest.mock("@/lib/pipeline/steps/storyboard-generate", () => ({
  runStoryboardGenerate: jest.fn(async () => ({ ok: true, payload: {} })),
}));
jest.mock("@/lib/pipeline/steps/embedding-generate", () => ({
  runEmbeddingGenerate: jest.fn(async () => ({ ok: true, chunkCount: 0 })),
}));

// ─── Test ──────────────────────────────────────────────────────────────────

import { startPipeline, cancelPipeline } from "@/lib/pipeline/orchestrator";

describe("cancelPipeline", () => {
  it("aborts an in-flight step and writes pipelineStatus=cancelled", async () => {
    const projectId = "project-abort-1";

    // Start the pipeline with a resume buffer so `resume_parse` triggers the
    // gated mock (and doesn't get `skipped` for lack of input).
    startPipeline(projectId, {
      resumeBuffer: Buffer.from("fake-pdf"),
      resumeMimeType: "application/pdf",
    });

    // Wait one tick so the orchestrator enters the step.
    await new Promise((r) => setTimeout(r, 10));

    expect(mockParseResume).toHaveBeenCalledTimes(1);
    const signal = mockParseResume.mock.calls[0][2] as AbortSignal | undefined;
    expect(signal).toBeDefined();
    expect(signal?.aborted).toBe(false);

    // Fire cancellation. Returns true because the run is active.
    const aborted = cancelPipeline(projectId);
    expect(aborted).toBe(true);

    // Unblock the step so the abort handler inside the gate rejects.
    releaseStep();

    // Give the orchestrator a few ticks to finish unwinding.
    await new Promise((r) => setTimeout(r, 20));

    // The step's signal has fired.
    expect(signal?.aborted).toBe(true);

    // Downstream steps must not have executed.
    expect(mockStructureResume).not.toHaveBeenCalled();

    // At least one `update(projects).set({...pipelineStatus: "cancelled"})`
    // call was made.
    const setCalls = mockProjectsSet.mock.calls as unknown as Array<
      [Record<string, unknown>]
    >;
    const cancelledCall = setCalls.find(
      (c) => (c[0] as any)?.pipelineStatus === "cancelled"
    );
    expect(cancelledCall).toBeTruthy();
    expect((cancelledCall![0] as any).pipelineError).toBe("Cancelled by owner");

    // A second cancel returns false (nothing left to abort).
    expect(cancelPipeline(projectId)).toBe(false);
  });
});
