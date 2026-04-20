/**
 * Platform detection for user-supplied demo URLs.
 *
 * The regex registry below is the SINGLE source of truth for "what kind of
 * thing is this URL?". Detection runs at save time in the API route and
 * the result is cached in `project_demos.type` — UI consumers never re-run
 * these regexes on user input.
 *
 * Adding a new platform is a one-line PR: add a matcher here, add a test
 * case to `platform-detect.test.ts`, and (if it needs iframe embedding)
 * add its host to the relevant allowlist in this file.
 */

import type { DemoType, ProjectDemo, ResolvedDemo } from "@/lib/demos/types";

// ─── Regex registry ─────────────────────────────────────────────────────────

interface Matcher {
  type: DemoType;
  pattern: RegExp;
  /** Optional: derive a canonical embed URL from the regex match. */
  embed?: (m: RegExpMatchArray) => string;
}

/**
 * Ordered list — first match wins. Platform-specific matchers (youtube /
 * loom / vimeo) must come before the generic extension-based matchers so
 * that `https://loom.com/share/…` isn't misclassified when it ends with
 * something extension-y.
 */
const MATCHERS: readonly Matcher[] = [
  {
    type: "youtube",
    pattern:
      /^https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/i,
    embed: (m) => `https://www.youtube.com/embed/${m[1]}`,
  },
  {
    type: "loom",
    pattern: /^https?:\/\/(?:www\.)?loom\.com\/share\/([a-f0-9]{32})/i,
    embed: (m) => `https://www.loom.com/embed/${m[1]}`,
  },
  {
    type: "vimeo",
    pattern: /^https?:\/\/(?:www\.)?vimeo\.com\/(\d+)/i,
    embed: (m) => `https://player.vimeo.com/video/${m[1]}`,
  },
  { type: "gif", pattern: /\.gif(\?|#|$)/i },
  { type: "image", pattern: /\.(png|jpe?g|webp|avif)(\?|#|$)/i },
  { type: "video", pattern: /\.(mp4|webm|mov)(\?|#|$)/i },
];

// ─── Host allowlist (iframe safety) ─────────────────────────────────────────

/**
 * Hosts we'll render as sandboxed `<iframe>`s. Anything outside this list
 * falls back to the "other" branch (link-out) no matter what the regex
 * registry matched. This is belt-and-suspenders: the matcher already
 * normalizes the embed URL to a trusted host, but an attacker who crafts
 * a URL that matches the regex on a host we don't trust is shut down here.
 */
const IFRAME_HOST_ALLOWLIST: ReadonlySet<string> = new Set([
  "www.youtube.com",
  "youtube.com",
  "www.loom.com",
  "loom.com",
  "player.vimeo.com",
]);

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Classify a URL into one of the supported {@link DemoType} values.
 * Defaults to `"other"` when no matcher hits. Safe for all input — does
 * not throw.
 */
export function detectDemoType(url: string): DemoType {
  for (const m of MATCHERS) {
    if (m.pattern.test(url)) return m.type;
  }
  return "other";
}

/**
 * Lift a persisted {@link ProjectDemo} into a {@link ResolvedDemo} suitable
 * for rendering: computes `embedUrl` for iframe types and flags
 * `isEmbeddable` for the three non-`"other"` categories.
 *
 * If the matched embed URL's host is not in {@link IFRAME_HOST_ALLOWLIST},
 * the demo is downgraded to `embedUrl: null` — consumers should render it
 * as a link-out even if its `type` says otherwise.
 */
export function resolveDemo(demo: ProjectDemo): ResolvedDemo {
  let embedUrl: string | null = null;
  const needsEmbed =
    demo.type === "youtube" || demo.type === "loom" || demo.type === "vimeo";

  if (needsEmbed) {
    for (const m of MATCHERS) {
      if (m.type !== demo.type) continue;
      const match = demo.url.match(m.pattern);
      if (match && m.embed) {
        const candidate = m.embed(match);
        try {
          const host = new URL(candidate).hostname.toLowerCase();
          if (IFRAME_HOST_ALLOWLIST.has(host)) {
            embedUrl = candidate;
          }
        } catch {
          // Malformed embed URL — leave null, falls through to link-out.
        }
      }
      break;
    }
  }

  const isEmbeddable = demo.type !== "other";

  return { ...demo, embedUrl, isEmbeddable };
}

/**
 * Exported for tests — asserts a host is in the allowlist without requiring
 * callers to know the exact set.
 */
export function isHostAllowedForIframe(host: string): boolean {
  return IFRAME_HOST_ALLOWLIST.has(host.toLowerCase());
}
