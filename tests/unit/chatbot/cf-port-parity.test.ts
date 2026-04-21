/**
 * @jest-environment node
 *
 * Phase 9 — Parity test for the chatbot internals ported into the Pages
 * Function (`functions/_shared/*`) vs the builder copies
 * (`src/lib/chatbot/*`).
 *
 * Goal: if either copy drifts, this test fails loudly with a diff. Two
 * parallel implementations are a chronic source of subtle RAG / prompt
 * bugs unless enforced at CI.
 *
 * Covered surface:
 *   - `cosineSimilarity(a, b)` → same score on same vectors.
 *   - `rankChunks(query, candidates, k)` → same ordering, scores, slicing.
 *   - `buildSystemPrompt(input)` → byte-identical strings.
 *   - `buildUserPrompt(chunks, message)` → byte-identical strings.
 *   - `encodeToken` / `encodeDone` / `encodeError` / `SSE_CONTENT_TYPE`.
 *   - `CANNED_REFUSAL` / `MAX_CONTEXT_CHUNKS` / `MAX_VISITOR_MESSAGE_CHARS`.
 *
 * Relative imports because `functions/` has no alias in jest.config (only
 * `@/*` → `src/*` and `@/templates/*` → `templates/*`).
 */

// Builder copies (canonical).
import {
  cosineSimilarity as builderCosine,
  rankChunks as builderRank,
  type RankableChunk,
} from "../../../src/lib/chatbot/retrieve";
import {
  buildSystemPrompt as builderSystemPrompt,
  buildUserPrompt as builderUserPrompt,
} from "../../../src/lib/chatbot/prompt";
import {
  encodeToken as builderEncodeToken,
  encodeDone as builderEncodeDone,
  encodeError as builderEncodeError,
  SSE_CONTENT_TYPE as builderContentType,
} from "../../../src/lib/chatbot/stream";
import {
  CANNED_REFUSAL as builderRefusal,
  MAX_CONTEXT_CHUNKS as builderMaxCtx,
  MAX_VISITOR_MESSAGE_CHARS as builderMaxMsg,
} from "../../../src/lib/chatbot/types";

// Function-side ports.
import {
  cosineSimilarity as cfCosine,
  rankChunks as cfRank,
} from "../../../functions/_shared/retrieve";
import {
  buildSystemPrompt as cfSystemPrompt,
  buildUserPrompt as cfUserPrompt,
} from "../../../functions/_shared/prompt";
import {
  encodeToken as cfEncodeToken,
  encodeDone as cfEncodeDone,
  encodeError as cfEncodeError,
  SSE_CONTENT_TYPE as cfContentType,
} from "../../../functions/_shared/stream";
import {
  CANNED_REFUSAL as cfRefusal,
  MAX_CONTEXT_CHUNKS as cfMaxCtx,
  MAX_VISITOR_MESSAGE_CHARS as cfMaxMsg,
  type ChunkRow,
} from "../../../functions/_shared/types";

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makeCandidates(): RankableChunk[] {
  return [
    {
      id: "c1",
      chunkType: "fact",
      chunkText: "Built a JWT auth middleware in Node.",
      sourceRef: "facts:1",
      metadata: { projectName: "Widget API" },
      vector: [0.9, 0.1, 0.2, 0.1, 0.0],
    },
    {
      id: "c2",
      chunkType: "narrative",
      chunkText: "Deployed to Cloudflare Pages with GitHub Actions.",
      sourceRef: "generatedSections:2#para=0",
      metadata: { projectName: "Widget API" },
      vector: [0.1, 0.8, 0.1, 0.2, 0.0],
    },
    {
      id: "c3",
      chunkType: "project_summary",
      chunkText: "A TypeScript API for managing widgets.",
      sourceRef: null,
      metadata: { projectName: "Widget API" },
      vector: [0.5, 0.5, 0.5, 0.1, 0.0],
    },
  ];
}

/** Same data as `RankableChunk[]` but typed for the Function port. */
function makeCfCandidates(): ChunkRow[] {
  return makeCandidates().map((c) => ({ ...c }));
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Phase 9 — chatbot port parity", () => {
  it("cosineSimilarity produces identical results", () => {
    const pairs: Array<[number[], number[]]> = [
      [[1, 0, 0], [1, 0, 0]],
      [[1, 0, 0], [0, 1, 0]],
      [[0.3, 0.4, 0.5], [0.1, 0.9, 0.2]],
      [[0, 0, 0], [1, 1, 1]], // magA === 0
      [[], []], // zero-length
    ];
    for (const [a, b] of pairs) {
      expect(cfCosine(a, b)).toBe(builderCosine(a, b));
    }
  });

  it("rankChunks produces identical ordering + scores + slicing", () => {
    const query = [0.8, 0.2, 0.1, 0.0, 0.0];
    const cfOut = cfRank(query, makeCfCandidates(), 2);
    const builderOut = builderRank(query, makeCandidates(), 2);
    expect(cfOut).toEqual(builderOut);
  });

  it("rankChunks breaks ties deterministically (id ASC)", () => {
    const query = [1, 1, 1, 1, 1];
    // Two equal-magnitude vectors — both produce identical cosine vs
    // query. Differ only by id; ranker must break ties by id ASC.
    const cands: RankableChunk[] = [
      {
        id: "zz",
        chunkType: "fact",
        chunkText: "zz",
        sourceRef: null,
        metadata: {},
        vector: [1, 0, 0, 0, 0],
      },
      {
        id: "aa",
        chunkType: "fact",
        chunkText: "aa",
        sourceRef: null,
        metadata: {},
        vector: [1, 0, 0, 0, 0],
      },
    ];
    const cfOut = cfRank(query, cands as ChunkRow[], 2);
    const builderOut = builderRank(query, cands, 2);
    expect(cfOut).toEqual(builderOut);
    expect(cfOut[0].chunkText).toBe("aa");
  });

  it("buildSystemPrompt produces identical output", () => {
    const inputs = [
      { ownerName: "Alice" },
      { ownerName: "Bob", portfolioName: "Bob's site" },
      { ownerName: "Carol", portfolioName: null },
      { ownerName: "Dave", portfolioName: "" },
    ];
    for (const input of inputs) {
      expect(cfSystemPrompt(input)).toBe(builderSystemPrompt(input));
    }
  });

  it("buildUserPrompt produces identical output", () => {
    const chunks = [
      {
        chunkType: "fact" as const,
        chunkText: "Used JWT",
        sourceRef: "facts:1",
        metadata: { projectName: "Widget API" },
        score: 0.9,
      },
      {
        chunkType: "narrative" as const,
        chunkText: "Deployed to Fly.io",
        sourceRef: "generatedSections:2",
        metadata: {},
        score: 0.7,
      },
    ];
    const messages = [
      "What did Alice build?",
      "Tell me about Widget API",
      "",
      "Multi\nline\nquestion",
    ];
    for (const msg of messages) {
      expect(cfUserPrompt(chunks, msg)).toBe(
        builderUserPrompt(chunks, msg)
      );
    }
  });

  it("SSE encoders produce byte-identical frames", () => {
    expect(cfEncodeToken("hello")).toBe(builderEncodeToken("hello"));
    expect(cfEncodeToken('with "quotes"')).toBe(
      builderEncodeToken('with "quotes"')
    );
    expect(cfEncodeDone("session-123")).toBe(builderEncodeDone("session-123"));
    expect(cfEncodeError("internal", "oops")).toBe(
      builderEncodeError("internal", "oops")
    );
    expect(cfContentType).toBe(builderContentType);
  });

  it("constants (refusal, context size, message cap) stay in sync", () => {
    expect(cfRefusal).toBe(builderRefusal);
    expect(cfMaxCtx).toBe(builderMaxCtx);
    expect(cfMaxMsg).toBe(builderMaxMsg);
  });
});
