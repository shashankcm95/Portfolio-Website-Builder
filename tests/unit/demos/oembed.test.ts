/**
 * @jest-environment node
 *
 * Unit tests for `src/lib/demos/oembed.ts`. Exercises the contract:
 *   - endpoint URL is constructed per-provider with encoded ?url=
 *   - 5s AbortController timeout fires
 *   - 50 KB streamed-response cap returns null
 *   - https-only validation on `thumbnail_url`
 *   - malformed JSON / non-2xx / missing fields → null
 */

import { fetchOembed, parseOembedResponse } from "@/lib/demos/oembed";

// Jest timers — we fake time for the timeout test only.
const realFetch = global.fetch;

function mockFetchOnce(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  global.fetch = jest.fn(impl) as any;
}

afterEach(() => {
  global.fetch = realFetch;
  jest.useRealTimers();
});

// ─── parseOembedResponse ────────────────────────────────────────────────────

describe("parseOembedResponse", () => {
  it("extracts https thumbnail + title", () => {
    expect(
      parseOembedResponse({
        thumbnail_url: "https://i.ytimg.com/vi/x/hqdefault.jpg",
        title: "Hello",
        html: "<iframe src='evil'></iframe>", // ignored
      })
    ).toEqual({
      thumbnailUrl: "https://i.ytimg.com/vi/x/hqdefault.jpg",
      title: "Hello",
    });
  });

  it("drops http:// thumbnail but keeps title", () => {
    expect(
      parseOembedResponse({
        thumbnail_url: "http://insecure.example/thumb.png",
        title: "Video",
      })
    ).toEqual({ thumbnailUrl: null, title: "Video" });
  });

  it("drops javascript: thumbnail but keeps title", () => {
    expect(
      parseOembedResponse({
        thumbnail_url: "javascript:alert(1)",
        title: "T",
      })
    ).toEqual({ thumbnailUrl: null, title: "T" });
  });

  it("drops data: thumbnail", () => {
    expect(
      parseOembedResponse({
        thumbnail_url: "data:image/png;base64,AAA",
        title: "T",
      })
    ).toEqual({ thumbnailUrl: null, title: "T" });
  });

  it("returns null when both fields are missing/unusable", () => {
    expect(parseOembedResponse({})).toBeNull();
    expect(parseOembedResponse({ thumbnail_url: "http://x" })).toBeNull();
    expect(parseOembedResponse({ title: "" })).toBeNull();
    expect(parseOembedResponse(null)).toBeNull();
    expect(parseOembedResponse("not-an-object")).toBeNull();
  });

  it("is case-insensitive on the https scheme", () => {
    const r = parseOembedResponse({
      thumbnail_url: "HTTPS://x.example/t.png",
      title: "t",
    });
    expect(r?.thumbnailUrl).toBe("HTTPS://x.example/t.png");
  });

  it("trims surrounding whitespace on the thumbnail", () => {
    const r = parseOembedResponse({
      thumbnail_url: "  https://x.example/t.png  ",
      title: "t",
    });
    expect(r?.thumbnailUrl).toBe("https://x.example/t.png");
  });
});

// ─── fetchOembed ────────────────────────────────────────────────────────────

describe("fetchOembed", () => {
  it("constructs the YouTube endpoint with encoded ?url=", async () => {
    let seenUrl = "";
    mockFetchOnce(async (u) => {
      seenUrl = u;
      return new Response(
        JSON.stringify({
          thumbnail_url: "https://i.ytimg.com/vi/x/hqdefault.jpg",
          title: "Title",
        }),
        { status: 200 }
      );
    });

    await fetchOembed("youtube", "https://www.youtube.com/watch?v=abc&x=1");
    expect(seenUrl).toBe(
      "https://www.youtube.com/oembed?url=" +
        encodeURIComponent("https://www.youtube.com/watch?v=abc&x=1") +
        "&format=json"
    );
  });

  it("constructs the Loom endpoint", async () => {
    let seenUrl = "";
    mockFetchOnce(async (u) => {
      seenUrl = u;
      return new Response(
        JSON.stringify({ thumbnail_url: "https://cdn.loom.com/t.jpg" }),
        { status: 200 }
      );
    });
    await fetchOembed("loom", "https://loom.com/share/abc");
    expect(seenUrl).toMatch(/^https:\/\/www\.loom\.com\/v1\/oembed\?url=/);
  });

  it("constructs the Vimeo endpoint", async () => {
    let seenUrl = "";
    mockFetchOnce(async (u) => {
      seenUrl = u;
      return new Response(
        JSON.stringify({ thumbnail_url: "https://i.vimeocdn.com/t.jpg" }),
        { status: 200 }
      );
    });
    await fetchOembed("vimeo", "https://vimeo.com/123");
    expect(seenUrl).toMatch(/^https:\/\/vimeo\.com\/api\/oembed\.json\?url=/);
  });

  it("returns null on non-2xx", async () => {
    mockFetchOnce(async () => new Response("gone", { status: 404 }));
    const r = await fetchOembed("youtube", "https://www.youtube.com/watch?v=x");
    expect(r).toBeNull();
  });

  it("returns null on malformed JSON", async () => {
    mockFetchOnce(async () => new Response("not{json", { status: 200 }));
    const r = await fetchOembed("youtube", "https://www.youtube.com/watch?v=x");
    expect(r).toBeNull();
  });

  it("returns null when the response exceeds 50 KB", async () => {
    // Build a body >50KB that streams in chunks.
    const chunk = new Uint8Array(16 * 1024); // 16 KB per chunk
    chunk.fill(0x20); // space
    mockFetchOnce(async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          // Push 4 × 16KB = 64 KB, well over the 50 KB cap.
          for (let i = 0; i < 4; i++) controller.enqueue(chunk);
          controller.close();
        },
      });
      return new Response(stream, { status: 200 });
    });
    const r = await fetchOembed("youtube", "https://www.youtube.com/watch?v=x");
    expect(r).toBeNull();
  });

  it("returns null when the request aborts (timeout/network)", async () => {
    mockFetchOnce(async (_, init) => {
      // Simulate abort: reject with AbortError when signal fires.
      return new Promise<Response>((_, reject) => {
        const signal = init?.signal;
        if (signal) {
          signal.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }
        // Never resolve.
      });
    });

    jest.useFakeTimers();
    const p = fetchOembed(
      "youtube",
      "https://www.youtube.com/watch?v=x"
    );
    jest.advanceTimersByTime(6000);
    const r = await p;
    expect(r).toBeNull();
  });

  it("returns null when fetch throws (network error)", async () => {
    mockFetchOnce(async () => {
      throw new Error("ENOTFOUND");
    });
    const r = await fetchOembed("youtube", "https://www.youtube.com/watch?v=x");
    expect(r).toBeNull();
  });

  it("happy path returns { thumbnailUrl, title }", async () => {
    mockFetchOnce(
      async () =>
        new Response(
          JSON.stringify({
            thumbnail_url: "https://i.ytimg.com/vi/dQ/hqdefault.jpg",
            title: "Never Gonna Give You Up",
          }),
          { status: 200 }
        )
    );
    const r = await fetchOembed(
      "youtube",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    );
    expect(r).toEqual({
      thumbnailUrl: "https://i.ytimg.com/vi/dQ/hqdefault.jpg",
      title: "Never Gonna Give You Up",
    });
  });
});
