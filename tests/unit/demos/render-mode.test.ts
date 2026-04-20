import {
  hasMixedSlideshowTypes,
  toRenderMode,
} from "@/lib/demos/render-mode";
import type { ResolvedDemo } from "@/lib/demos/types";

function d(
  overrides: Partial<ResolvedDemo> & { type: ResolvedDemo["type"] }
): ResolvedDemo {
  return {
    id: "d",
    url: "https://example.com/x",
    title: null,
    order: 0,
    embedUrl: null,
    isEmbeddable: true,
    ...overrides,
  };
}

describe("toRenderMode", () => {
  it("returns { kind: 'none' } for empty list", () => {
    expect(toRenderMode([])).toEqual({ kind: "none" });
  });

  it("returns { kind: 'single', demo } for one item", () => {
    const only = d({ type: "youtube" });
    expect(toRenderMode([only])).toEqual({ kind: "single", demo: only });
  });

  it("returns slideshow when all items are images", () => {
    const demos = [
      d({ id: "1", type: "image", order: 0 }),
      d({ id: "2", type: "image", order: 1 }),
      d({ id: "3", type: "image", order: 2 }),
    ];
    expect(toRenderMode(demos)).toEqual({ kind: "slideshow", demos });
  });

  it("returns slideshow for mixed image + gif types (both are slideshow-compatible)", () => {
    const demos = [
      d({ id: "1", type: "image", order: 0 }),
      d({ id: "2", type: "gif", order: 1 }),
    ];
    expect(toRenderMode(demos).kind).toBe("slideshow");
  });

  it("falls back to single (first wins) for mixed video + image", () => {
    const first = d({ id: "first", type: "youtube", order: 0 });
    const demos = [first, d({ id: "2", type: "image", order: 1 })];
    expect(toRenderMode(demos)).toEqual({ kind: "single", demo: first });
  });

  it("falls back to single for mixed video + video file", () => {
    const first = d({ id: "1", type: "video", order: 0 });
    const demos = [first, d({ id: "2", type: "image", order: 1 })];
    expect(toRenderMode(demos).kind).toBe("single");
  });

  it("handles the exact 2-item boundary for slideshow", () => {
    const two = [
      d({ id: "1", type: "image", order: 0 }),
      d({ id: "2", type: "image", order: 1 }),
    ];
    expect(toRenderMode(two)).toEqual({ kind: "slideshow", demos: two });
  });

  it("returns single for 2 items of 'other' type (not slideshow-compatible)", () => {
    const demos = [
      d({ id: "1", type: "other", order: 0 }),
      d({ id: "2", type: "other", order: 1 }),
    ];
    expect(toRenderMode(demos).kind).toBe("single");
  });
});

describe("hasMixedSlideshowTypes", () => {
  it("returns false for empty list", () => {
    expect(hasMixedSlideshowTypes([])).toBe(false);
  });

  it("returns false for a single item (nothing to mix)", () => {
    expect(hasMixedSlideshowTypes([d({ type: "video" })])).toBe(false);
  });

  it("returns false when all items are slideshow-compatible", () => {
    expect(
      hasMixedSlideshowTypes([
        d({ id: "1", type: "image", order: 0 }),
        d({ id: "2", type: "gif", order: 1 }),
      ])
    ).toBe(false);
  });

  it("returns true when at least one item breaks slideshow compatibility", () => {
    expect(
      hasMixedSlideshowTypes([
        d({ id: "1", type: "image", order: 0 }),
        d({ id: "2", type: "youtube", order: 1 }),
      ])
    ).toBe(true);
  });
});
