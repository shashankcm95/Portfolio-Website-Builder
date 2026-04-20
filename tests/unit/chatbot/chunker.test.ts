/**
 * @jest-environment node
 *
 * Unit tests for `src/lib/chatbot/chunker.ts`. These lock down the
 * chunking contract the embedding pipeline relies on:
 *
 *   - deterministic ordering (profile → per project: summary → facts →
 *     derived → narrative)
 *   - one chunk per fact / derived_fact
 *   - paragraphs split on blank lines
 *   - oversize paragraphs get sentence-packed into ≤ CHUNK_MAX_CHARS pieces
 *   - user-edited narrative overrides the model draft
 */

import {
  buildChunks,
  sentenceSplit,
  splitParagraphs,
  type ChunkerInput,
} from "@/lib/chatbot/chunker";
import { CHUNK_MAX_CHARS } from "@/lib/chatbot/types";

function makeInput(partial: Partial<ChunkerInput>): ChunkerInput {
  return {
    profile: {
      portfolioId: "pf-1",
      ownerName: "Ada Lovelace",
      bio: "Mathematician.",
      topSkills: ["Algebra"],
    },
    projects: [],
    factsByProject: new Map(),
    derivedFactsByProject: new Map(),
    sectionsByProject: new Map(),
    ...partial,
  };
}

describe("buildChunks", () => {
  it("emits exactly one profile chunk when there are no projects", () => {
    const out = buildChunks(makeInput({}));
    expect(out).toHaveLength(1);
    expect(out[0].chunkType).toBe("profile");
    expect(out[0].sourceRef).toBe("profile:pf-1");
    expect(out[0].chunkText).toContain("Ada Lovelace");
    expect(out[0].chunkText).toContain("Mathematician.");
    expect(out[0].chunkText).toContain("Skills: Algebra");
  });

  it("skips empty bio / skills in the profile chunk", () => {
    const out = buildChunks(
      makeInput({ profile: { portfolioId: "pf-1", ownerName: "Ada" } })
    );
    expect(out[0].chunkText).toBe("Ada");
  });

  it("emits per-project summary chunks with name/desc/stack", () => {
    const out = buildChunks(
      makeInput({
        projects: [
          {
            id: "p-1",
            name: "Widget API",
            description: "REST + GraphQL",
            stackSummary: "Go, Postgres",
          },
        ],
      })
    );
    const summary = out.find((c) => c.chunkType === "project_summary");
    expect(summary).toBeDefined();
    expect(summary!.chunkText).toContain("Project: Widget API");
    expect(summary!.chunkText).toContain("REST + GraphQL");
    expect(summary!.chunkText).toContain("Stack: Go, Postgres");
    expect(summary!.metadata.projectId).toBe("p-1");
    expect(summary!.sourceRef).toBe("projects:p-1");
  });

  it("emits one chunk per fact, joining category + claim + evidence", () => {
    const out = buildChunks(
      makeInput({
        projects: [{ id: "p-1", name: "Widget" }],
        factsByProject: new Map([
          [
            "p-1",
            [
              {
                id: "f-1",
                projectId: "p-1",
                category: "performance",
                claim: "Handles 10k req/s",
                evidenceText: "benchmarks/perf.md shows p99 = 9ms at 10k rps",
              },
            ],
          ],
        ]),
      })
    );
    const fact = out.find((c) => c.chunkType === "fact");
    expect(fact!.chunkText).toContain("performance: Handles 10k req/s");
    expect(fact!.chunkText).toContain("Evidence: benchmarks/perf.md");
    expect(fact!.sourceRef).toBe("facts:f-1");
  });

  it("truncates long fact evidence with an ellipsis", () => {
    const longEvidence = "x".repeat(800);
    const out = buildChunks(
      makeInput({
        projects: [{ id: "p-1", name: "Widget" }],
        factsByProject: new Map([
          [
            "p-1",
            [
              {
                id: "f-1",
                projectId: "p-1",
                category: "perf",
                claim: "Fast",
                evidenceText: longEvidence,
              },
            ],
          ],
        ]),
      })
    );
    const fact = out.find((c) => c.chunkType === "fact")!;
    expect(fact.chunkText.length).toBeLessThan(longEvidence.length);
    expect(fact.chunkText).toMatch(/…$/);
  });

  it("splits a multi-paragraph narrative section into multiple chunks", () => {
    const section = {
      id: "s-1",
      projectId: "p-1",
      sectionType: "recruiter",
      content: "First paragraph here.\n\nSecond paragraph.\n\nThird one.",
    };
    const out = buildChunks(
      makeInput({
        projects: [{ id: "p-1", name: "Widget" }],
        sectionsByProject: new Map([["p-1", [section]]]),
      })
    );
    const narrative = out.filter((c) => c.chunkType === "narrative");
    expect(narrative).toHaveLength(3);
    expect(narrative[0].sourceRef).toBe(
      "generatedSections:s-1#para=0"
    );
    expect(narrative[2].chunkText).toBe("Third one.");
  });

  it("prefers userContent when isUserEdited=true", () => {
    const out = buildChunks(
      makeInput({
        projects: [{ id: "p-1", name: "W" }],
        sectionsByProject: new Map([
          [
            "p-1",
            [
              {
                id: "s-1",
                projectId: "p-1",
                sectionType: "recruiter",
                content: "Model draft.",
                userContent: "Owner revision.",
                isUserEdited: true,
              },
            ],
          ],
        ]),
      })
    );
    expect(
      out.find((c) => c.chunkType === "narrative")!.chunkText
    ).toBe("Owner revision.");
  });

  it("ignores empty userContent even when isUserEdited=true (falls back to draft)", () => {
    const out = buildChunks(
      makeInput({
        projects: [{ id: "p-1", name: "W" }],
        sectionsByProject: new Map([
          [
            "p-1",
            [
              {
                id: "s-1",
                projectId: "p-1",
                sectionType: "recruiter",
                content: "Model draft.",
                userContent: "   ",
                isUserEdited: true,
              },
            ],
          ],
        ]),
      })
    );
    expect(
      out.find((c) => c.chunkType === "narrative")!.chunkText
    ).toBe("Model draft.");
  });

  it("sentence-splits paragraphs larger than CHUNK_MAX_CHARS", () => {
    const bigPara =
      "First. ".repeat(Math.ceil(CHUNK_MAX_CHARS / 7) + 10).trim();
    const out = buildChunks(
      makeInput({
        projects: [{ id: "p-1", name: "W" }],
        sectionsByProject: new Map([
          [
            "p-1",
            [
              {
                id: "s-1",
                projectId: "p-1",
                sectionType: "recruiter",
                content: bigPara,
              },
            ],
          ],
        ]),
      })
    );
    const narrative = out.filter((c) => c.chunkType === "narrative");
    expect(narrative.length).toBeGreaterThan(1);
    for (const c of narrative) {
      expect(c.chunkText.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
    }
    // Source refs should be dot-suffixed when a single paragraph splits.
    expect(narrative[0].sourceRef).toMatch(/#para=0\.0$/);
  });

  it("keeps deterministic order: profile → per-project (summary → facts → derived → narrative)", () => {
    const out = buildChunks(
      makeInput({
        projects: [{ id: "p-1", name: "W" }],
        factsByProject: new Map([
          [
            "p-1",
            [
              {
                id: "f-1",
                projectId: "p-1",
                category: "x",
                claim: "a",
                evidenceText: null,
              },
            ],
          ],
        ]),
        derivedFactsByProject: new Map([
          [
            "p-1",
            [{ id: "d-1", projectId: "p-1", claim: "derived" }],
          ],
        ]),
        sectionsByProject: new Map([
          [
            "p-1",
            [
              {
                id: "s-1",
                projectId: "p-1",
                sectionType: "recruiter",
                content: "para",
              },
            ],
          ],
        ]),
      })
    );
    const types = out.map((c) => c.chunkType);
    expect(types).toEqual([
      "profile",
      "project_summary",
      "fact",
      "derived_fact",
      "narrative",
    ]);
  });
});

// ─── Primitive helpers ──────────────────────────────────────────────────────

describe("splitParagraphs", () => {
  it("splits on blank lines", () => {
    expect(splitParagraphs("a\n\nb\n\nc")).toEqual(["a", "b", "c"]);
  });
  it("trims each paragraph", () => {
    expect(splitParagraphs("  a  \n\n  b  ")).toEqual(["a", "b"]);
  });
  it("drops empty paragraphs", () => {
    expect(splitParagraphs("\n\n\n")).toEqual([]);
  });
});

describe("sentenceSplit", () => {
  it("returns the paragraph as-is when below the cap", () => {
    expect(sentenceSplit("Short. Fine.")).toEqual(["Short. Fine."]);
  });
  it("packs sentences up to the cap", () => {
    const para = "First. ".repeat(300).trim();
    const out = sentenceSplit(para);
    expect(out.length).toBeGreaterThan(1);
    for (const s of out) expect(s.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
  });
  it("preserves trailing punctuation", () => {
    expect(sentenceSplit("A. B! C?").join(" ")).toMatch(/[.!?]/);
  });
});
