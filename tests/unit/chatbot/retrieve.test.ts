/**
 * @jest-environment node
 *
 * Unit tests for `src/lib/chatbot/retrieve.ts`. The pure cosine /
 * parser helpers are covered directly; `retrieveTopK` is covered with
 * a mocked Drizzle `db` to assert top-K selection and tie-breaking.
 */

// Mock BEFORE the module-under-test imports anything from @/lib/db.
jest.mock("@/lib/db", () => {
  const rows: unknown[] = [];
  return {
    __setRows: (r: unknown[]) => {
      rows.length = 0;
      rows.push(...r);
    },
    db: {
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: async () => rows,
          }),
        }),
      }),
    },
  };
});

jest.mock("drizzle-orm", () => {
  const actual = jest.requireActual("drizzle-orm");
  return { ...actual, eq: jest.fn(() => "eq"), and: jest.fn(() => "and") };
});

import {
  cosineSimilarity,
  parseEmbeddingCell,
  retrieveTopK,
} from "@/lib/chatbot/retrieve";

// Grab the test hook exposed by the db mock above.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { __setRows } = require("@/lib/db");

function makeRow(
  id: string,
  vector: number[],
  overrides: Partial<{
    chunkType: string;
    chunkText: string;
    sourceRef: string | null;
    metadata: Record<string, unknown>;
  }> = {}
) {
  return {
    id,
    chunkType: overrides.chunkType ?? "fact",
    chunkText: overrides.chunkText ?? `text-${id}`,
    sourceRef: overrides.sourceRef ?? `facts:${id}`,
    embedding: JSON.stringify(vector),
    metadata: overrides.metadata ?? {},
  };
}

// ─── cosineSimilarity ───────────────────────────────────────────────────────

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 6);
  });
  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });
  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [-1, -2, -3])).toBeCloseTo(-1, 6);
  });
  it("is invariant to magnitude", () => {
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 6);
  });
  it("handles empty / zero vectors without crashing", () => {
    expect(cosineSimilarity([], [1, 2])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
  });
});

// ─── parseEmbeddingCell ─────────────────────────────────────────────────────

describe("parseEmbeddingCell", () => {
  it("parses a valid JSON array of numbers", () => {
    expect(parseEmbeddingCell("[1,2,3]")).toEqual([1, 2, 3]);
  });
  it("returns null on malformed JSON", () => {
    expect(parseEmbeddingCell("not-json")).toBeNull();
  });
  it("returns null on non-arrays", () => {
    expect(parseEmbeddingCell('{"a":1}')).toBeNull();
  });
  it("returns null when any element isn't a finite number", () => {
    expect(parseEmbeddingCell("[1,2,null]")).toBeNull();
    expect(parseEmbeddingCell('[1,"x",3]')).toBeNull();
    expect(parseEmbeddingCell("[1,2,NaN]")).toBeNull();
  });
});

// ─── retrieveTopK ───────────────────────────────────────────────────────────

describe("retrieveTopK", () => {
  beforeEach(() => {
    __setRows([]);
  });

  it("returns empty array when no rows exist", async () => {
    __setRows([]);
    const r = await retrieveTopK("pf-1", [1, 0, 0]);
    expect(r).toEqual([]);
  });

  it("ranks rows by cosine similarity and respects k", async () => {
    __setRows([
      makeRow("a", [1, 0, 0]),
      makeRow("b", [0, 1, 0]),
      makeRow("c", [0.9, 0.1, 0]),
      makeRow("d", [-1, 0, 0]),
    ]);
    const r = await retrieveTopK("pf-1", [1, 0, 0], 2);
    expect(r).toHaveLength(2);
    // a (score=1) beats c (score≈0.9947) beats b (0) beats d (-1)
    expect(r[0].sourceRef).toBe("facts:a");
    expect(r[1].sourceRef).toBe("facts:c");
    expect(r[0].score).toBeCloseTo(1, 4);
  });

  it("breaks score ties by id ASC (deterministic)", async () => {
    __setRows([
      makeRow("z", [1, 0, 0]),
      makeRow("a", [1, 0, 0]),
      makeRow("m", [1, 0, 0]),
    ]);
    const r = await retrieveTopK("pf-1", [1, 0, 0], 3);
    expect(r.map((c) => c.sourceRef)).toEqual([
      "facts:a",
      "facts:m",
      "facts:z",
    ]);
  });

  it("skips rows whose embedding column is malformed", async () => {
    __setRows([
      makeRow("ok", [1, 0, 0]),
      {
        id: "bad",
        chunkType: "fact",
        chunkText: "skip me",
        sourceRef: "facts:bad",
        embedding: "not-json",
        metadata: {},
      },
    ]);
    const r = await retrieveTopK("pf-1", [1, 0, 0], 10);
    expect(r).toHaveLength(1);
    expect(r[0].sourceRef).toBe("facts:ok");
  });

  it("preserves chunkType and metadata through the result", async () => {
    __setRows([
      makeRow("p-1", [1, 0, 0], {
        chunkType: "project_summary",
        metadata: { projectId: "proj-1", projectName: "Widget" },
      }),
    ]);
    const r = await retrieveTopK("pf-1", [1, 0, 0]);
    expect(r[0].chunkType).toBe("project_summary");
    expect(r[0].metadata).toEqual({ projectId: "proj-1", projectName: "Widget" });
  });

  it("falls back sourceRef to embeddings:{id} when the column is null", async () => {
    __setRows([
      {
        id: "x",
        chunkType: "fact",
        chunkText: "t",
        sourceRef: null, // explicitly null — not undefined
        embedding: JSON.stringify([1, 0, 0]),
        metadata: {},
      },
    ]);
    const r = await retrieveTopK("pf-1", [1, 0, 0]);
    expect(r[0].sourceRef).toBe("embeddings:x");
  });
});
