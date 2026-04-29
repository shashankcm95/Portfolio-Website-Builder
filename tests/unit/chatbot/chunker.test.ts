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
    // Phase R8 — when no role/company/location/experience are set the
    // identity sentence collapses to "<Name>." (period only). Bio +
    // skills lines remain absent.
    expect(out[0].chunkText).toBe("Ada.");
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

  // ─── Phase R6 — career + availability chunks ──────────────────────────────

  it("emits a career chunk when namedEmployers is set", () => {
    const out = buildChunks(
      makeInput({
        profile: {
          portfolioId: "pf-1",
          ownerName: "Ada Lovelace",
          namedEmployers: ["Apple", "Klaviyo"],
        },
      })
    );
    const career = out.find((c) => c.chunkType === "career");
    expect(career).toBeDefined();
    expect(career!.chunkText).toContain("Apple");
    expect(career!.chunkText).toContain("Klaviyo");
    // Two phrasings — covers "previously at" and "companies he worked for"
    // embedding queries.
    expect(career!.chunkText).toMatch(/Previously at: Apple, Klaviyo/);
    expect(career!.chunkText).toMatch(/Companies Ada Lovelace has worked for/);
    expect(career!.sourceRef).toBe("career:pf-1");
  });

  it("emits a career chunk with experience roles", () => {
    const out = buildChunks(
      makeInput({
        profile: {
          portfolioId: "pf-1",
          ownerName: "Ada",
          experience: [
            {
              company: "Klaviyo",
              position: "Senior Engineer",
              startDate: "2021-03-01",
              endDate: "2024-08-01",
              summary: "Led pricing-engine rebuild.",
              highlights: ["Cut p99 by 40%", "Mentored 3 IC4s"],
            },
            {
              company: "Apple",
              position: "Software Engineer",
              startDate: "2018-06-01",
              endDate: "2021-02-01",
              summary: null,
              highlights: null,
            },
          ],
        },
      })
    );
    const career = out.find((c) => c.chunkType === "career");
    expect(career).toBeDefined();
    expect(career!.chunkText).toContain("Senior Engineer at Klaviyo (2021 — 2024)");
    expect(career!.chunkText).toContain("Software Engineer at Apple (2018 — 2021)");
    expect(career!.chunkText).toContain("Led pricing-engine rebuild");
    expect(career!.chunkText).toContain("Cut p99 by 40%");
  });

  it("does NOT emit a career chunk when no career data is present", () => {
    const out = buildChunks(makeInput({}));
    const career = out.find((c) => c.chunkType === "career");
    expect(career).toBeUndefined();
  });

  it("emits an availability chunk for currentRole + hiring=available", () => {
    const out = buildChunks(
      makeInput({
        profile: {
          portfolioId: "pf-1",
          ownerName: "Ada",
          currentRole: "Senior Engineer",
          currentCompany: "Klaviyo",
          hiring: { status: "available", ctaText: "Let's chat" },
        },
      })
    );
    const avail = out.find((c) => c.chunkType === "availability");
    expect(avail).toBeDefined();
    expect(avail!.chunkText).toContain(
      "Ada is currently working as Senior Engineer at Klaviyo"
    );
    expect(avail!.chunkText).toContain("Ada is currently available for new work");
    expect(avail!.chunkText).toContain('"Let\'s chat"');
    expect(avail!.sourceRef).toBe("availability:pf-1");
  });

  it("emits an availability chunk for hiring=open without CTA", () => {
    const out = buildChunks(
      makeInput({
        profile: {
          portfolioId: "pf-1",
          ownerName: "Ada",
          hiring: { status: "open" },
        },
      })
    );
    const avail = out.find((c) => c.chunkType === "availability");
    expect(avail).toBeDefined();
    expect(avail!.chunkText).toContain(
      "Ada is open to conversations about new work"
    );
  });

  it("does NOT emit an availability chunk when hiring is not-looking and no role", () => {
    const out = buildChunks(
      makeInput({
        profile: {
          portfolioId: "pf-1",
          ownerName: "Ada",
          hiring: { status: "not-looking" },
        },
      })
    );
    const avail = out.find((c) => c.chunkType === "availability");
    expect(avail).toBeUndefined();
  });

  // ─── Phase R8 — identity sentence + location + role types + years ──────────

  it("profile chunk leads with an identity sentence composed from live fields", () => {
    const out = buildChunks(
      makeInput({
        profile: {
          portfolioId: "pf-1",
          ownerName: "Shashank C M",
          bio: "Backend engineer building distributed systems.",
          currentRole: "Backend Engineer",
          currentCompany: "Abbott Labs",
          location: { city: "Plano", region: "TX" },
          experience: [
            { company: "Amazon", position: "SDE I", startDate: "2021-06-01" },
            { company: "Abbott Labs", position: "Backend Engineer", startDate: "2024-01-01" },
          ],
        },
      })
    );
    const profile = out.find((c) => c.chunkType === "profile");
    expect(profile).toBeDefined();
    // Identity sentence is the first line — anchor for "tell me about him" queries.
    const firstLine = profile!.chunkText.split("\n")[0];
    expect(firstLine).toContain("Shashank C M");
    expect(firstLine).toContain("is a Backend Engineer at Abbott Labs");
    expect(firstLine).toContain("based in Plano, TX");
    expect(firstLine).toMatch(/with \d+\+ years of professional experience/);
  });

  it("identity sentence falls back gracefully when fields are missing", () => {
    const out = buildChunks(
      makeInput({
        profile: { portfolioId: "pf-1", ownerName: "Ada Lovelace" },
      })
    );
    const profile = out.find((c) => c.chunkType === "profile");
    expect(profile!.chunkText.split("\n")[0]).toBe("Ada Lovelace.");
  });

  it("availability chunk surfaces location, role types, and work eligibility", () => {
    const out = buildChunks(
      makeInput({
        profile: {
          portfolioId: "pf-1",
          ownerName: "Shashank",
          hiring: { status: "available" },
          location: { city: "Plano", region: "TX" },
          roleTypes: { ic: true, fullTime: true, remote: true, hybrid: true },
          workEligibility: ["US"],
        },
      })
    );
    const avail = out.find((c) => c.chunkType === "availability");
    expect(avail).toBeDefined();
    expect(avail!.chunkText).toContain("based in Plano, TX");
    expect(avail!.chunkText).toContain("Open to: IC roles, full-time, remote/hybrid");
    expect(avail!.chunkText).toContain("authorized to work in: US");
  });

  it("availability chunk emits years-of-experience by SUMMING role durations (not earliest-to-now)", () => {
    // R8.1 — earliest-to-now over-counts career breaks (grad school).
    // shashank-cm's profile is the canonical case: Allstate 2017-2019 →
    // Masters 2019-2021 (no work) → Liberty Defense 2021 → Amazon
    // 2021-2023 → Abbott 2024-Present. Naive earliest = 2017→2026 = 9
    // years (matches what the v2 chatbot said, but bio claims 6+). The
    // sum-durations approach excludes the masters gap and lands at the
    // honest number.
    const out = buildChunks(
      makeInput({
        profile: {
          portfolioId: "pf-1",
          ownerName: "Eng",
          hiring: { status: "available" },
          experience: [
            // 2 years of work
            { company: "FirstCo", position: "Eng I", startDate: "2017-01-01", endDate: "2019-01-01" },
            // GAP of 2 years (e.g. masters degree) — must NOT count
            // 2 years of work (closed)
            { company: "MidCo", position: "Eng II", startDate: "2021-01-01", endDate: "2023-01-01" },
          ],
        },
      })
    );
    const avail = out.find((c) => c.chunkType === "availability");
    // Two roles × 2 years each = 4 years total. Whatever the test's
    // current year is, this should always be exactly 4.
    expect(avail!.chunkText).toContain("Eng has 4+ years of professional software-engineering experience");
  });

  it("years-of-experience handles current ('Present') endDate by using today", () => {
    // A role that started 3 years ago and has no endDate should count
    // as 3 years (regardless of when the test runs in the future).
    const startYear = new Date().getUTCFullYear() - 3;
    const out = buildChunks(
      makeInput({
        profile: {
          portfolioId: "pf-1",
          ownerName: "Eng",
          hiring: { status: "available" },
          experience: [
            { company: "Co", position: "Eng", startDate: `${startYear}-01-01` },
          ],
        },
      })
    );
    const avail = out.find((c) => c.chunkType === "availability");
    expect(avail!.chunkText).toMatch(/Eng has 3\+ years/);
  });

  it("career chunk includes the 'Where has X worked' anchor + Companies summary", () => {
    const out = buildChunks(
      makeInput({
        profile: {
          portfolioId: "pf-1",
          ownerName: "Shashank",
          namedEmployers: ["Amazon", "Abbott Labs"],
          experience: [
            { company: "Amazon", position: "SDE", startDate: "2021-06-01", endDate: "2024-01-01" },
            { company: "Abbott Labs", position: "Backend Eng", startDate: "2024-01-01" },
          ],
        },
      })
    );
    const career = out.find((c) => c.chunkType === "career");
    expect(career!.chunkText).toContain("Where has Shashank worked: Amazon, Abbott Labs");
    expect(career!.chunkText).toContain("Companies: Amazon (2021 — 2024), Abbott Labs (2024 — Present)");
  });

  it("orders career + availability immediately after the profile chunk", () => {
    const out = buildChunks(
      makeInput({
        profile: {
          portfolioId: "pf-1",
          ownerName: "Ada",
          namedEmployers: ["Apple"],
          currentRole: "Engineer",
          currentCompany: "Klaviyo",
          hiring: { status: "available" },
        },
        projects: [
          {
            id: "p-1",
            name: "Widget",
            description: "stuff",
            stackSummary: "Go",
          },
        ],
      })
    );
    expect(out.map((c) => c.chunkType)).toEqual([
      "profile",
      "career",
      "availability",
      "project_summary",
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
