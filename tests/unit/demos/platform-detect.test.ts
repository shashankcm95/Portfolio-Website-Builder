import {
  detectDemoType,
  isHostAllowedForIframe,
  resolveDemo,
} from "@/lib/demos/platform-detect";
import type { ProjectDemo } from "@/lib/demos/types";

function demo(partial: Partial<ProjectDemo>): ProjectDemo {
  return {
    id: "d1",
    url: "",
    type: "other",
    title: null,
    order: 0,
    ...partial,
  };
}

describe("detectDemoType", () => {
  // Table-driven URL matrix
  it.each([
    // YouTube variants
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube"],
    ["https://youtube.com/watch?v=dQw4w9WgXcQ", "youtube"],
    ["https://youtu.be/dQw4w9WgXcQ", "youtube"],
    ["https://www.youtube.com/shorts/abc12345678", "youtube"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "youtube"],
    // Loom
    ["https://www.loom.com/share/abcdef0123456789abcdef0123456789", "loom"],
    ["https://loom.com/share/abcdef0123456789abcdef0123456789", "loom"],
    // Vimeo
    ["https://vimeo.com/123456789", "vimeo"],
    ["https://www.vimeo.com/987654321", "vimeo"],
    // Direct images
    ["https://cdn.example.com/shot.png", "image"],
    ["https://cdn.example.com/shot.jpg", "image"],
    ["https://cdn.example.com/shot.jpeg", "image"],
    ["https://cdn.example.com/shot.webp", "image"],
    ["https://cdn.example.com/shot.avif", "image"],
    // GIF
    ["https://cdn.example.com/demo.gif", "gif"],
    ["https://cdn.example.com/demo.gif?v=2", "gif"],
    // Direct video
    ["https://cdn.example.com/clip.mp4", "video"],
    ["https://cdn.example.com/clip.webm", "video"],
    ["https://cdn.example.com/clip.mov", "video"],
    // Adversarial — not what it looks like
    ["https://evil.com/foo.mp4.html", "other"],
    ["https://evil.com/fake-youtube.com/watch?v=x", "other"],
    // Non-platform URLs
    ["https://example.com/", "other"],
    ["https://example.com/some/path", "other"],
  ])("classifies %s as %s", (url, expected) => {
    expect(detectDemoType(url)).toBe(expected);
  });

  it("handles URL with trailing query string on extension", () => {
    expect(detectDemoType("https://cdn.example.com/clip.mp4?t=5s")).toBe(
      "video"
    );
    expect(detectDemoType("https://cdn.example.com/shot.png?w=400")).toBe(
      "image"
    );
  });

  it("handles URL with fragment on extension", () => {
    expect(detectDemoType("https://cdn.example.com/clip.mp4#t=5")).toBe(
      "video"
    );
  });

  it("defaults to 'other' for empty string", () => {
    expect(detectDemoType("")).toBe("other");
  });
});

describe("resolveDemo", () => {
  it("derives the YouTube embed URL", () => {
    const resolved = resolveDemo(
      demo({
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        type: "youtube",
      })
    );
    expect(resolved.embedUrl).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ"
    );
    expect(resolved.isEmbeddable).toBe(true);
  });

  it("derives the Loom embed URL", () => {
    const resolved = resolveDemo(
      demo({
        url: "https://www.loom.com/share/abcdef0123456789abcdef0123456789",
        type: "loom",
      })
    );
    expect(resolved.embedUrl).toBe(
      "https://www.loom.com/embed/abcdef0123456789abcdef0123456789"
    );
  });

  it("derives the Vimeo embed URL", () => {
    const resolved = resolveDemo(
      demo({ url: "https://vimeo.com/123456789", type: "vimeo" })
    );
    expect(resolved.embedUrl).toBe("https://player.vimeo.com/video/123456789");
  });

  it("leaves embedUrl null for image/gif/video", () => {
    expect(
      resolveDemo(demo({ url: "x", type: "image" })).embedUrl
    ).toBeNull();
    expect(resolveDemo(demo({ url: "x", type: "gif" })).embedUrl).toBeNull();
    expect(resolveDemo(demo({ url: "x", type: "video" })).embedUrl).toBeNull();
  });

  it("leaves embedUrl null and isEmbeddable false for 'other'", () => {
    const resolved = resolveDemo(
      demo({ url: "https://example.com", type: "other" })
    );
    expect(resolved.embedUrl).toBeNull();
    expect(resolved.isEmbeddable).toBe(false);
  });

  it("preserves all original fields", () => {
    const original = demo({
      url: "https://vimeo.com/42",
      type: "vimeo",
      title: "My clip",
      order: 3,
    });
    const resolved = resolveDemo(original);
    expect(resolved.title).toBe("My clip");
    expect(resolved.order).toBe(3);
    expect(resolved.id).toBe("d1");
  });
});

describe("isHostAllowedForIframe", () => {
  it("allows canonical hosts", () => {
    expect(isHostAllowedForIframe("www.youtube.com")).toBe(true);
    expect(isHostAllowedForIframe("youtube.com")).toBe(true);
    expect(isHostAllowedForIframe("www.loom.com")).toBe(true);
    expect(isHostAllowedForIframe("loom.com")).toBe(true);
    expect(isHostAllowedForIframe("player.vimeo.com")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isHostAllowedForIframe("WWW.YOUTUBE.COM")).toBe(true);
  });

  it("rejects subdomain / lookalike hosts", () => {
    expect(isHostAllowedForIframe("evil.youtube.com.attacker.com")).toBe(false);
    expect(isHostAllowedForIframe("youtube.com.evil.com")).toBe(false);
    expect(isHostAllowedForIframe("fake-youtube.com")).toBe(false);
  });
});
