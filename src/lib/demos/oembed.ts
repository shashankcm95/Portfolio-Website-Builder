/**
 * Phase 4.2 — oEmbed enrichment for YouTube / Loom / Vimeo demos.
 *
 * Security posture: we NEVER dereference user-supplied URLs directly. The
 * user URL is passed as a query-parameter to a hardcoded provider endpoint;
 * the provider resolves it. This avoids SSRF against internal addresses.
 *
 *   - 5-second timeout via AbortController.
 *   - 50 KB response cap via streamed read.
 *   - `thumbnail_url` must be https:// or it's dropped (title kept).
 *   - `html` field is IGNORED — our own <DemoEmbed> is the source of truth.
 *
 * Returns `null` on any failure (timeout / non-2xx / oversize / malformed);
 * callers treat null as "not enriched, retry on next save".
 */
export type OembedProvider = "youtube" | "loom" | "vimeo";

export interface OembedData {
  /** Always absolute https:// URL, or null. */
  thumbnailUrl: string | null;
  title: string | null;
}

const OEMBED_ENDPOINTS: Record<OembedProvider, string> = {
  youtube: "https://www.youtube.com/oembed",
  loom: "https://www.loom.com/v1/oembed",
  vimeo: "https://vimeo.com/api/oembed.json",
};

const TIMEOUT_MS = 5000;
const MAX_RESPONSE_BYTES = 50_000;

/**
 * Fetch oEmbed metadata for a demo URL. See module docstring for the
 * security contract. Returns null on any failure — never throws.
 */
export async function fetchOembed(
  provider: OembedProvider,
  demoUrl: string
): Promise<OembedData | null> {
  const endpoint = OEMBED_ENDPOINTS[provider];
  const url = `${endpoint}?url=${encodeURIComponent(demoUrl)}&format=json`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;

    const text = await readCapped(res, MAX_RESPONSE_BYTES);
    if (text === null) return null;

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return null;
    }
    return parseOembedResponse(raw);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Stream the response body until either EOF or `maxBytes`. Returns the
 * accumulated UTF-8 text, or null when the body exceeds the cap (we abort
 * further reads and treat oversize responses as failure). Falls back to
 * `res.text()` for environments without a stream body.
 */
async function readCapped(
  res: Response,
  maxBytes: number
): Promise<string | null> {
  const body = res.body;
  if (!body) {
    // No streaming body — read fully, then enforce the cap on the result.
    const t = await res.text();
    return t.length > maxBytes ? null : t;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          /* best-effort */
        }
        return null;
      }
      chunks.push(value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* noop */
    }
  }

  // Assemble chunks into a single UTF-8 string.
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    joined.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8").decode(joined);
}

/**
 * Pull `thumbnail_url` and `title` out of an oEmbed response. Validates
 * that `thumbnail_url` (if present) is an absolute https:// URL — any
 * other scheme (http:, data:, javascript:) is dropped. The `title` is
 * preserved independently. Returns null only when BOTH fields are unusable.
 */
export function parseOembedResponse(raw: unknown): OembedData | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const rawThumb = typeof obj.thumbnail_url === "string" ? obj.thumbnail_url : null;
  const thumbnailUrl =
    rawThumb && /^https:\/\//i.test(rawThumb.trim()) ? rawThumb.trim() : null;

  const rawTitle = typeof obj.title === "string" ? obj.title.trim() : null;
  const title = rawTitle && rawTitle.length > 0 ? rawTitle : null;

  if (!thumbnailUrl && !title) return null;
  return { thumbnailUrl, title };
}
