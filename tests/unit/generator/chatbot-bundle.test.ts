/**
 * @jest-environment node
 *
 * Phase 9 — Unit tests for the self-hosted chatbot bundler.
 *
 * Covers:
 *   - The bundle emits the expected file set (functions/_shared/
 *     embeddings.ts, chat.html, chat.js, chat.css, wrangler.toml).
 *   - chat.html has all placeholder tokens substituted.
 *   - embeddings.ts exports the expected symbols with correct values.
 *   - An empty corpus bakes as an empty-array export (bundle still
 *     succeeds — the chatbot just returns the canned refusal).
 *   - wrangler.toml declares the Workers AI binding.
 *
 * The BGE embedding step is mocked out so the test doesn't hit the
 * network. End-to-end embedding behavior is exercised separately.
 */

// Mock the CF embedder so no external call is made. Hoisted via jest.
jest.mock("@/lib/ai/cf-embed", () => ({
  embedCorpusForPortfolio: jest.fn(async () => []),
  BGE_DIMENSIONS: 768,
}));

import { buildSelfHostedChatbotFiles } from "@/lib/generator/chatbot-bundle";
import { embedCorpusForPortfolio } from "@/lib/ai/cf-embed";

const mockEmbed = embedCorpusForPortfolio as jest.Mock;

beforeEach(() => {
  mockEmbed.mockReset();
});

describe("buildSelfHostedChatbotFiles", () => {
  it("emits the expected file set", async () => {
    mockEmbed.mockResolvedValueOnce([]);
    const { files } = await buildSelfHostedChatbotFiles({
      portfolioId: "pf-1",
      ownerName: "Alice",
      greeting: null,
      starters: [],
    });

    expect(files.has("functions/_shared/embeddings.ts")).toBe(true);
    expect(files.has("chat.html")).toBe(true);
    expect(files.has("chat.js")).toBe(true);
    expect(files.has("chat.css")).toBe(true);
    expect(files.has("wrangler.toml")).toBe(true);
  });

  it("substitutes {{OWNER_NAME}} and {{CONFIG_JSON}} in chat.html", async () => {
    mockEmbed.mockResolvedValueOnce([]);
    const { files } = await buildSelfHostedChatbotFiles({
      portfolioId: "pf-2",
      ownerName: "Bob",
      greeting: "Hello!",
      starters: ["What do you build?"],
    });

    const html = files.get("chat.html") as string;
    expect(html).not.toMatch(/\{\{OWNER_NAME\}\}/);
    expect(html).not.toMatch(/\{\{CONFIG_JSON\}\}/);
    expect(html).toContain("Chat with Bob");
    // Inlined JSON — parsing the extracted blob confirms it's valid.
    const m = html.match(
      /<script type="application\/json" id="chat-config">([\s\S]*?)<\/script>/
    );
    expect(m).not.toBeNull();
    const parsed = JSON.parse(m![1]);
    expect(parsed.portfolioId).toBe("pf-2");
    expect(parsed.ownerName).toBe("Bob");
    expect(parsed.greeting).toBe("Hello!");
    expect(parsed.starters).toEqual(["What do you build?"]);
  });

  it("HTML-escapes ownerName in title/aria-label contexts", async () => {
    mockEmbed.mockResolvedValueOnce([]);
    const { files } = await buildSelfHostedChatbotFiles({
      portfolioId: "pf-3",
      ownerName: `Eve</script><img src=x onerror=alert(1)>`,
      greeting: null,
      starters: [],
    });
    const html = files.get("chat.html") as string;

    // In the <title> + aria-label contexts, `<`/`>` are escaped so
    // the injected payload is inert text, not an active DOM node.
    expect(html).toMatch(
      /<title>Chat with Eve&lt;\/script&gt;&lt;img src=x onerror=alert\(1\)&gt;<\/title>/
    );
    expect(html).toMatch(
      /aria-label="Open chat with Eve&lt;\/script&gt;&lt;img src=x onerror=alert\(1\)&gt;"/
    );

    // The <script type="application/json"> blob CAN contain literal
    // `<img>` tokens because that context is inert — browsers don't
    // parse JSON content as HTML. What matters is that </script> is
    // escaped so the browser doesn't early-terminate the script tag.
    const m = html.match(
      /<script type="application\/json" id="chat-config">([\s\S]*?)<\/script>/
    );
    expect(m).not.toBeNull();
    expect(m![1]).not.toMatch(/<\/script>/);
  });

  it("escapes </script> sequences inside the inlined config JSON", async () => {
    mockEmbed.mockResolvedValueOnce([]);
    const { files } = await buildSelfHostedChatbotFiles({
      portfolioId: "pf-4",
      ownerName: "Owner",
      greeting: "Evil </script> greeting",
      starters: [],
    });
    const html = files.get("chat.html") as string;
    // The literal </script> inside the JSON must be split so the
    // browser doesn't terminate the script tag early.
    const m = html.match(
      /<script type="application\/json" id="chat-config">([\s\S]*?)<\/script>/
    );
    expect(m).not.toBeNull();
    expect(m![1]).not.toMatch(/<\/script>/);
    expect(m![1]).toMatch(/<\\\/script>/);
  });

  it("embeddings.ts exports all required symbols with correct values", async () => {
    mockEmbed.mockResolvedValueOnce([
      {
        id: "c1",
        chunkType: "fact",
        chunkText: "Built a JWT middleware.",
        sourceRef: "facts:1",
        metadata: { projectName: "Widget API" },
        vector: [0.1, 0.2, 0.3],
      },
    ]);

    const { files, chunkCount } = await buildSelfHostedChatbotFiles({
      portfolioId: "pf-5",
      ownerName: "Carol",
      greeting: "Hi!",
      starters: ["Tell me about your projects"],
    });

    expect(chunkCount).toBe(1);
    const embSrc = files.get("functions/_shared/embeddings.ts") as string;
    expect(embSrc).toMatch(/export const OWNER_NAME: string = "Carol"/);
    expect(embSrc).toMatch(/export const PORTFOLIO_ID: string = "pf-5"/);
    expect(embSrc).toMatch(/export const GREETING: string \| null = "Hi!"/);
    expect(embSrc).toMatch(
      /export const STARTERS: string\[\] = \["Tell me about your projects"\]/
    );
    expect(embSrc).toMatch(/export const EMBEDDINGS: ChunkRow\[\]/);
    // The corpus must contain the vector + chunk text verbatim.
    expect(embSrc).toContain('"Built a JWT middleware."');
    expect(embSrc).toContain('[0.1,0.2,0.3]');
    // Module structure — must import from the template's ChunkRow type.
    expect(embSrc).toMatch(/import type \{ ChunkRow \} from ".\/types"/);
  });

  it("empty corpus still emits a syntactically-valid module", async () => {
    mockEmbed.mockResolvedValueOnce([]);
    const { files, chunkCount } = await buildSelfHostedChatbotFiles({
      portfolioId: "pf-6",
      ownerName: "Dave",
      greeting: null,
      starters: [],
    });
    expect(chunkCount).toBe(0);
    const embSrc = files.get("functions/_shared/embeddings.ts") as string;
    expect(embSrc).toMatch(/export const EMBEDDINGS: ChunkRow\[\] = \[\]/);
    expect(embSrc).toMatch(/export const GREETING: string \| null = null/);
    expect(embSrc).toMatch(/export const STARTERS: string\[\] = \[\]/);
  });

  it("wrangler.toml declares the Workers AI binding", async () => {
    mockEmbed.mockResolvedValueOnce([]);
    const { files } = await buildSelfHostedChatbotFiles({
      portfolioId: "pf-7",
      ownerName: "Eve",
      greeting: null,
      starters: [],
    });
    const toml = files.get("wrangler.toml") as string;
    expect(toml).toMatch(/\[ai\]/);
    expect(toml).toMatch(/binding\s*=\s*"AI"/);
    expect(toml).toMatch(/compatibility_date/);
  });

  it("propagates embedder failures upward by surfacing chunkCount=0", async () => {
    // The embedder's own contract is "best-effort — drop failed chunks";
    // here we simulate a total failure (empty result) and confirm the
    // bundler completes + reports zero chunks.
    mockEmbed.mockResolvedValueOnce([]);
    const { chunkCount } = await buildSelfHostedChatbotFiles({
      portfolioId: "pf-8",
      ownerName: "Frank",
      greeting: null,
      starters: [],
    });
    expect(chunkCount).toBe(0);
  });
});
