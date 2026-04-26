/**
 * @jest-environment node
 *
 * Phase E1 — unit tests for the new ProfileData readers that surface
 * storyboard, demos, and credibility data on the published site.
 *
 * Each helper takes the raw shape we get back from a Drizzle query (or
 * jsonb column) and produces a clean, template-ready payload — or
 * `undefined` when there's nothing meaningful to render. The whole point
 * of E1 is plumbing without template changes; getting the readers right
 * is what unlocks the visual phases (E2, E3) without surprises.
 *
 * No DB, no LLM, no file I/O. Pure input → output.
 */

import {
  readCredibility,
  readDemos,
  readStoryboardFromSections,
} from "@/lib/generator/profile-data";
import { CARD_ORDER, type StoryboardPayload } from "@/lib/ai/schemas/storyboard";

// ─── readStoryboardFromSections ─────────────────────────────────────────────

describe("readStoryboardFromSections", () => {
  /**
   * Build a minimal-but-valid 6-card storyboard payload. Tests construct
   * one of these and serialize it into a `generated_sections.content`
   * string to mimic what the storyboard-generate step persists.
   */
  function makePayload(): StoryboardPayload {
    return {
      schemaVersion: 1,
      mermaid: "graph TD; A-->B",
      cards: CARD_ORDER.map((id) => ({
        id,
        icon: "Circle",
        title: `Card ${id}`,
        description: `Description for ${id}`,
        claims: [],
        extra: null,
      })),
    } as StoryboardPayload;
  }

  it("returns the parsed payload from the LLM-emitted content", () => {
    const payload = makePayload();
    const out = readStoryboardFromSections([
      {
        sectionType: "storyboard",
        variant: "default",
        content: JSON.stringify(payload),
        isUserEdited: false,
        userContent: null,
        version: 1,
      },
    ]);
    expect(out).toBeDefined();
    expect(out?.cards).toHaveLength(6);
    expect(out?.cards.map((c) => c.id)).toEqual(CARD_ORDER);
  });

  it("prefers user-edited content over the LLM content when isUserEdited=true", () => {
    const llmPayload = makePayload();
    const userPayload = {
      ...makePayload(),
      mermaid: "graph TD; X-->Y",
    };
    const out = readStoryboardFromSections([
      {
        sectionType: "storyboard",
        variant: "default",
        content: JSON.stringify(llmPayload),
        userContent: JSON.stringify(userPayload),
        isUserEdited: true,
        version: 1,
      },
    ]);
    expect(out?.mermaid).toBe("graph TD; X-->Y");
  });

  it("ignores user-edited content when userContent is null", () => {
    const llmPayload = makePayload();
    const out = readStoryboardFromSections([
      {
        sectionType: "storyboard",
        variant: "default",
        content: JSON.stringify(llmPayload),
        userContent: null,
        isUserEdited: true, // flag set but no content — fall back to LLM
        version: 1,
      },
    ]);
    expect(out?.mermaid).toBe(llmPayload.mermaid);
  });

  it("picks the highest version when multiple rows exist", () => {
    const v1 = { ...makePayload(), mermaid: "graph TD; v1" };
    const v2 = { ...makePayload(), mermaid: "graph TD; v2" };
    const out = readStoryboardFromSections([
      {
        sectionType: "storyboard",
        variant: "default",
        content: JSON.stringify(v1),
        userContent: null,
        isUserEdited: false,
        version: 1,
      },
      {
        sectionType: "storyboard",
        variant: "default",
        content: JSON.stringify(v2),
        userContent: null,
        isUserEdited: false,
        version: 2,
      },
    ]);
    expect(out?.mermaid).toBe("graph TD; v2");
  });

  it("ignores rows from other section types or variants", () => {
    const payload = makePayload();
    const out = readStoryboardFromSections([
      {
        sectionType: "summary", // wrong type
        variant: "default",
        content: JSON.stringify(payload),
        userContent: null,
        isUserEdited: false,
        version: 1,
      },
      {
        sectionType: "storyboard",
        variant: "engineer", // wrong variant
        content: JSON.stringify(payload),
        userContent: null,
        isUserEdited: false,
        version: 1,
      },
    ]);
    expect(out).toBeUndefined();
  });

  it("returns undefined for malformed JSON", () => {
    const out = readStoryboardFromSections([
      {
        sectionType: "storyboard",
        variant: "default",
        content: "{this is not json",
        userContent: null,
        isUserEdited: false,
        version: 1,
      },
    ]);
    expect(out).toBeUndefined();
  });

  it("returns undefined when the payload fails schema validation", () => {
    // Wrong number of cards — zod's superRefine flags it.
    const broken = { ...makePayload(), cards: [] };
    const out = readStoryboardFromSections([
      {
        sectionType: "storyboard",
        variant: "default",
        content: JSON.stringify(broken),
        userContent: null,
        isUserEdited: false,
        version: 1,
      },
    ]);
    expect(out).toBeUndefined();
  });

  it("returns undefined when no storyboard row exists at all", () => {
    expect(readStoryboardFromSections([])).toBeUndefined();
  });
});

// ─── readDemos ──────────────────────────────────────────────────────────────

describe("readDemos", () => {
  it("returns undefined for missing or empty input", () => {
    expect(readDemos(undefined)).toBeUndefined();
    expect(readDemos([])).toBeUndefined();
  });

  it("maps DB rows to the wire shape, preserving order", () => {
    const out = readDemos([
      {
        id: "d1",
        url: "https://youtube.com/watch?v=abc",
        type: "youtube",
        title: "Demo 1",
        order: 0,
        thumbnailUrl: "https://i.ytimg.com/abc.jpg",
        oembedTitle: "Demo 1 Title",
        oembedFetchedAt: new Date("2026-01-01T00:00:00Z"),
      },
      {
        id: "d2",
        url: "https://example.com/demo.png",
        type: "image",
        title: null,
        order: 1,
      },
    ]);
    expect(out).toHaveLength(2);
    expect(out?.[0].url).toBe("https://youtube.com/watch?v=abc");
    expect(out?.[0].oembedFetchedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(out?.[1].thumbnailUrl).toBeNull();
    expect(out?.[1].oembedFetchedAt).toBeNull();
  });

  it("normalizes nullish enrichment fields to null (not undefined)", () => {
    const out = readDemos([
      {
        id: "d1",
        url: "https://example.com/x.png",
        type: "image",
        title: null,
        order: 0,
        thumbnailUrl: null,
        oembedTitle: null,
        oembedFetchedAt: null,
      },
    ]);
    expect(out?.[0].thumbnailUrl).toBeNull();
    expect(out?.[0].oembedFetchedAt).toBeNull();
  });
});

// ─── readCredibility ────────────────────────────────────────────────────────

describe("readCredibility", () => {
  it("returns undefined when nothing meaningful was distilled", () => {
    expect(readCredibility(null, null)).toBeUndefined();
    expect(readCredibility({}, null)).toBeUndefined();
    expect(readCredibility(undefined, "")).toBeUndefined();
  });

  it("includes the project category when valid", () => {
    const out = readCredibility(null, "oss_author");
    expect(out?.category).toBe("oss_author");
  });

  it("rejects unknown category strings rather than baking garbage", () => {
    const out = readCredibility(null, "bogus_category");
    expect(out).toBeUndefined();
  });

  it("distils contributor count when status is ok", () => {
    const signals = {
      contributors: { status: "ok", count: 12 },
    };
    const out = readCredibility(signals, null);
    expect(out?.contributorCount).toBe(12);
  });

  it("ignores contributor count when status is not ok", () => {
    const signals = {
      contributors: { status: "error", count: 12 },
    };
    const out = readCredibility(signals, null);
    expect(out?.contributorCount).toBeUndefined();
  });

  it("flips hasCi true when workflows are present and ok", () => {
    const signals = {
      workflows: { status: "ok", workflows: [{ name: "ci.yml" }] },
    };
    const out = readCredibility(signals, null);
    expect(out?.hasCi).toBe(true);
  });

  it("does not claim hasCi when workflows scan failed", () => {
    const signals = {
      workflows: { status: "error" },
    };
    const out = readCredibility(signals, null);
    expect(out?.hasCi).toBeUndefined();
    expect(out).toBeUndefined();
  });

  it("flips hasReleases true based on releases array", () => {
    const signals = {
      releases: { status: "ok", releases: [{ tag: "v1.0.0" }] },
    };
    const out = readCredibility(signals, null);
    expect(out?.hasReleases).toBe(true);
  });

  it("flips hasTests true based on testFramework array", () => {
    const signals = {
      testFramework: { status: "ok", frameworks: [{ name: "jest" }] },
    };
    const out = readCredibility(signals, null);
    expect(out?.hasTests).toBe(true);
  });

  it("captures externalUrl when present and non-empty", () => {
    const signals = { externalUrl: "https://demo.example.com" };
    const out = readCredibility(signals, null);
    expect(out?.externalUrl).toBe("https://demo.example.com");
  });

  it("captures externalUrl as null when explicitly null", () => {
    // explicit null means "we looked, found nothing" — different from
    // a missing field which means the scorer never ran.
    const signals = { externalUrl: null };
    const out = readCredibility(signals, "oss_author");
    expect(out?.externalUrl).toBeNull();
  });

  it("captures authorshipStatus from the signal status", () => {
    const ok = readCredibility({ authorshipSignal: { status: "ok" } }, null);
    expect(ok?.authorshipStatus).toBe("ok");

    const missing = readCredibility(
      { authorshipSignal: { status: "missing", reason: "no commits" } },
      null
    );
    expect(missing?.authorshipStatus).toBe("missing");
  });

  it("returns the union of distilled fields when several are populated", () => {
    const signals = {
      authorshipSignal: { status: "ok" },
      contributors: { status: "ok", count: 8 },
      workflows: { status: "ok", workflows: [{ name: "ci.yml" }] },
      releases: { status: "ok", releases: [{ tag: "v1" }] },
      testFramework: { status: "ok", frameworks: [{ name: "jest" }] },
      externalUrl: "https://app.example.com",
    };
    const out = readCredibility(signals, "oss_author");
    expect(out).toEqual({
      category: "oss_author",
      authorshipStatus: "ok",
      contributorCount: 8,
      hasCi: true,
      hasReleases: true,
      hasTests: true,
      externalUrl: "https://app.example.com",
    });
  });

  it("never throws on truly malformed jsonb", () => {
    expect(() => readCredibility("not an object", null)).not.toThrow();
    expect(() => readCredibility(42, null)).not.toThrow();
    expect(() => readCredibility([1, 2, 3], null)).not.toThrow();
  });
});
