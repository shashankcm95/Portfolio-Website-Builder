/**
 * Phase 10 — shared cancellation sentinel.
 *
 * Lives in its own module so pipeline step files can import the error class
 * without pulling in the orchestrator (which itself imports every step,
 * creating a cycle).
 *
 * The orchestrator re-exports `PipelineAbortError` from its public surface
 * for ergonomics; tests can import either path.
 */

export class PipelineAbortError extends Error {
  constructor(message = "Pipeline aborted") {
    super(message);
    this.name = "PipelineAbortError";
  }
}

/**
 * Throws a `PipelineAbortError` when the supplied signal has fired.
 * Steps call this at every meaningful boundary (before LLM / network I/O).
 */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new PipelineAbortError();
  }
}
