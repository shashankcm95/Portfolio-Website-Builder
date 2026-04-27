/**
 * Phase 9 — Emit the self-hosted chatbot bundle into the Pages deploy.
 *
 * The builder calls `buildSelfHostedChatbotFiles(portfolioId)` at publish
 * time. The returned filename → content map is merged into the Pages
 * output directory (see `src/lib/generator/renderer.ts`). When the
 * renderer hands the tree to `wrangler pages deploy`, Cloudflare
 * automatically bundles:
 *
 *   - `functions/**` → Pages Functions at matching paths
 *   - `wrangler.toml` → runtime bindings (the Workers AI binding)
 *   - Everything else → static assets
 *
 * The `functions/api/chat/stream.ts`, `message.ts`, and `_shared/*.ts`
 * files already exist in the repo (and thus the deploy output when the
 * renderer copies them). What this module emits is:
 *
 *   1. `functions/_shared/embeddings.ts` — overrides the repo stub with
 *      the baked corpus + owner name + greeting for this portfolio.
 *   2. `chat.html` + `chat.js` + `chat.css` at the root — the iframe UI,
 *      with `{{OWNER_NAME}}` / `{{CONFIG_JSON}}` placeholders filled in.
 *   3. `wrangler.toml` — declares `[ai] binding = "AI"` so the Function
 *      can `env.AI.run(...)`.
 *
 * Best-effort: any failure here is surfaced to the caller, which
 * downgrades to the Phase 8.5 cross-origin chatbot (builder-hosted).
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { portfolios } from "@/lib/db/schema";
import { embedCorpusForPortfolio } from "@/lib/ai/cf-embed";

export interface ChatbotBundleInput {
  portfolioId: string;
  /** Owner's display name; baked for the visitor system prompt. */
  ownerName: string;
  /** Owner-authored greeting (first assistant message). Null → omitted. */
  greeting: string | null;
  /** Owner-authored starter chips. Empty → no chips. */
  starters: string[];
}

export interface ChatbotBundleFiles {
  files: Map<string, string>;
  /**
   * Number of chunks baked into the corpus. Zero usually means the
   * embedding step failed silently — surface upstream so the UI can
   * warn the owner.
   */
  chunkCount: number;
}

/**
 * Emit the per-portfolio Phase-9 files. Returns a map the caller merges
 * into the Pages deploy output. Throws only on catastrophic failures
 * (e.g. template files missing from the repo); routine embedding
 * problems are dropped + logged inside `embedCorpusForPortfolio`.
 */
export async function buildSelfHostedChatbotFiles(
  input: ChatbotBundleInput
): Promise<ChatbotBundleFiles> {
  const [
    embeddedCorpus,
    chatHtmlTemplate,
    chatJsSrc,
    chatCssSrc,
    repoFunctions,
  ] = await Promise.all([
    embedCorpusForPortfolio(input.portfolioId),
    readPublicFile("chat-embed/chat.html"),
    readPublicFile("chat-embed/chat.js"),
    readPublicFile("chat-embed/chat.css"),
    // Phase E6 — read the repo's functions/ tree so the deploy
    // outputDir contains the full Pages Functions source. Without this
    // step, `wrangler pages deploy <outputDir>` looked in the cwd
    // (the source repo) for functions, which meant it deployed the
    // STUB `embeddings.ts` (PORTFOLIO_ID = "") and the baked one in
    // outputDir was ignored. The chatbot then rejected every request
    // with "Portfolio mismatch" because portfolioId !== "".
    readRepoFunctions(),
  ]);

  const files = new Map<string, string>();

  // 1. Repo functions tree — copy verbatim so wrangler picks up the
  //    full Pages Functions source from outputDir, not from the
  //    builder's cwd.
  for (const [relPath, content] of repoFunctions) {
    files.set(relPath, content);
  }

  // 2. Baked embeddings module — overrides the repo stub in the deploy.
  //    MUST come after the bulk copy above so the stub is replaced
  //    by the baked version.
  files.set(
    "functions/_shared/embeddings.ts",
    renderEmbeddingsModule({
      portfolioId: input.portfolioId,
      ownerName: input.ownerName,
      greeting: input.greeting,
      starters: input.starters,
      corpus: embeddedCorpus,
    })
  );

  // 2. Iframe UI — placeholders filled in.
  const config = {
    portfolioId: input.portfolioId,
    ownerName: input.ownerName,
    greeting: input.greeting,
    starters: input.starters,
  };
  const chatHtml = chatHtmlTemplate
    .replace(/\{\{OWNER_NAME\}\}/g, escapeHtml(input.ownerName))
    .replace(/\{\{CONFIG_JSON\}\}/g, escapeScriptJson(JSON.stringify(config)));

  files.set("chat.html", chatHtml);
  files.set("chat.js", chatJsSrc);
  files.set("chat.css", chatCssSrc);

  // 3. wrangler.toml — Workers AI binding declaration. Pages picks this
  //    up when the output directory is `wrangler pages deploy`'d.
  files.set("wrangler.toml", WRANGLER_TOML);

  return { files, chunkCount: embeddedCorpus.length };
}

/**
 * Convenience: load portfolio fields + delegate to
 * `buildSelfHostedChatbotFiles`. Returns `null` when the portfolio
 * hasn't opted in — callers can then skip the whole bundle step.
 */
export async function buildChatbotBundleIfEnabled(
  portfolioId: string,
  ownerName: string
): Promise<ChatbotBundleFiles | null> {
  const [row] = await db
    .select({
      selfHostedChatbot: portfolios.selfHostedChatbot,
      chatbotEnabled: portfolios.chatbotEnabled,
      chatbotGreeting: portfolios.chatbotGreeting,
      chatbotStarters: portfolios.chatbotStarters,
    })
    .from(portfolios)
    .where(eq(portfolios.id, portfolioId))
    .limit(1);

  if (!row) return null;
  if (!row.selfHostedChatbot || !row.chatbotEnabled) return null;

  const starters = Array.isArray(row.chatbotStarters)
    ? (row.chatbotStarters as unknown[]).filter(
        (s): s is string => typeof s === "string"
      )
    : [];

  return buildSelfHostedChatbotFiles({
    portfolioId,
    ownerName,
    greeting: row.chatbotGreeting ?? null,
    starters,
  });
}

// ─── Template rendering ────────────────────────────────────────────────────

const WRANGLER_TOML = `# Phase 9 — Cloudflare Pages project config, auto-generated at publish.
# Binds Cloudflare Workers AI to the Pages Functions under functions/**.
# The chatbot Function reads this binding as \`env.AI\`.
compatibility_date = "2024-10-01"
compatibility_flags = ["nodejs_compat"]

[ai]
binding = "AI"
`;

function renderEmbeddingsModule(input: {
  portfolioId: string;
  ownerName: string;
  greeting: string | null;
  starters: string[];
  corpus: Array<{
    id: string;
    chunkType: string;
    chunkText: string;
    sourceRef: string | null;
    metadata: Record<string, unknown>;
    vector: number[];
  }>;
}): string {
  // JSON.stringify handles both arrays of numbers and the metadata
  // bag safely. Readability suffers a little (the file is ~1MB for a
  // 200-chunk corpus) but bundlers handle it fine and we prioritise
  // correctness.
  const corpusJson = JSON.stringify(input.corpus);
  const startersJson = JSON.stringify(input.starters);
  const greetingJson = JSON.stringify(input.greeting);
  const ownerJson = JSON.stringify(input.ownerName);
  const pidJson = JSON.stringify(input.portfolioId);
  const generatedAt = JSON.stringify(new Date().toISOString());

  return `// Phase 9 — Auto-generated at publish time. Do NOT edit by hand.
// Produced by src/lib/generator/chatbot-bundle.ts.

import type { ChunkRow } from "./types";

export const EMBEDDINGS: ChunkRow[] = ${corpusJson};
export const OWNER_NAME: string = ${ownerJson};
export const PORTFOLIO_ID: string = ${pidJson};
export const GREETING: string | null = ${greetingJson};
export const STARTERS: string[] = ${startersJson};
export const GENERATED_AT: string = ${generatedAt};
`;
}

async function readPublicFile(relative: string): Promise<string> {
  const full = path.join(process.cwd(), "public", relative);
  return readFile(full, "utf-8");
}

/**
 * Phase E6 — Read every `.ts` file under the repo's `functions/`
 * directory and return a `relativePath → content` map suitable for
 * merging into the renderer's deploy `files` map. Wrangler picks up
 * `outputDir/functions/**` as Pages Functions; without this step
 * `wrangler pages deploy outputDir` was silently using the cwd's
 * (source repo) functions/, so the baked embeddings.ts placed in
 * outputDir was ignored and visitors hit the stub's
 * `PORTFOLIO_ID = ""` resulting in "Portfolio mismatch" for every
 * message.
 *
 * We deliberately read only .ts files; `.template.ts` is included
 * (it's a developer reference and harmless to ship), and any
 * generated artifacts in functions/ would be too. Anything outside
 * `functions/` is out of scope.
 */
async function readRepoFunctions(): Promise<Map<string, string>> {
  const root = path.join(process.cwd(), "functions");
  const out = new Map<string, string>();
  const { readdir, stat } = await import("node:fs/promises");

  async function walk(dir: string, relPrefix: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return; // missing functions/ — nothing to copy, caller still
              // emits the baked embeddings.ts which is enough for
              // older deploys.
    }
    for (const name of entries) {
      const full = path.join(dir, name);
      const rel = relPrefix ? `${relPrefix}/${name}` : name;
      const s = await stat(full);
      if (s.isDirectory()) {
        await walk(full, rel);
      } else if (name.endsWith(".ts")) {
        const content = await readFile(full, "utf-8");
        out.set(`functions/${rel}`, content);
      }
    }
  }

  await walk(root, "");
  return out;
}

/** Escape `<`, `>`, `&`, `"` for safe HTML attribute + text content. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Escape a JSON string for safe inclusion inside `<script type="application
 * /json">`. Browsers treat `</script>` as a terminator regardless of
 * context, so we break that sequence. `<!--` / `-->` are also escaped
 * because they can end the script block in legacy quirks mode.
 */
function escapeScriptJson(s: string): string {
  return s
    .replace(/<\/(script)/gi, "<\\/$1")
    .replace(/<!--/g, "<\\!--")
    .replace(/-->/g, "--\\>");
}
