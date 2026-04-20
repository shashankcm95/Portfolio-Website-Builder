/**
 * Phase 4 — Project Demos. Shared types for the user-supplied BYO-URL demo
 * layer. A project has zero or more ordered demos; the UI renders them as
 * a single embed, a slideshow of images, or falls back to the LLM-emitted
 * storyboard "Try it" content.
 *
 * The canonical rendering decision lives in `render-mode.ts` — keep it
 * there, not duplicated across components.
 */

/**
 * What kind of media a URL points at. Cached in `project_demos.type` at
 * save time by {@link detectDemoType} so we don't run user-supplied
 * regexes on every render.
 */
export type DemoType =
  | "youtube"
  | "loom"
  | "vimeo"
  | "video" // direct .mp4 / .webm / .mov
  | "image" // .png / .jpg / .jpeg / .webp / .avif
  | "gif" // treated as image but allowed to animate-on-loop
  | "other"; // fallback: render as outbound link, NEVER as iframe

/** Persistence shape — matches the `project_demos` table. */
export interface ProjectDemo {
  id: string;
  url: string;
  type: DemoType;
  title: string | null;
  /** 0-indexed slide position. */
  order: number;
  // Phase 4.2 — oEmbed cache. Null until enrichment lands (or for non-
  // oEmbedable types). `oembedFetchedAt` is ISO-string on the wire.
  thumbnailUrl?: string | null;
  oembedTitle?: string | null;
  oembedFetchedAt?: string | null;
}

/**
 * Post-{@link resolveDemo} shape: adds `embedUrl` (canonical embed form
 * for iframe types) and `isEmbeddable` for quick UI branching.
 */
export interface ResolvedDemo extends ProjectDemo {
  /** Canonical embeddable URL, e.g. `https://www.youtube.com/embed/VIDEO_ID`. Null for "other". */
  embedUrl: string | null;
  /** True for youtube/loom/vimeo/video/image/gif. False for "other". */
  isEmbeddable: boolean;
}

/**
 * The single unit the UI renders. Computed by `toRenderMode(demos)`.
 *
 *   - "none"       → no demo; Card 6 falls back to the LLM's url/clone-command.
 *   - "single"     → render one resolved demo via <DemoEmbed>.
 *   - "slideshow"  → render an image/GIF carousel via <SlideshowEmbed>.
 */
export type DemoRenderMode =
  | { kind: "none" }
  | { kind: "single"; demo: ResolvedDemo }
  | { kind: "slideshow"; demos: ResolvedDemo[] };

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum number of demos a project can carry. Enforced server-side. */
export const MAX_DEMOS_PER_PROJECT = 8;

/** Maximum URL length for a single demo item. */
export const MAX_DEMO_URL_LENGTH = 2048;

/** Maximum length of an optional per-item title. */
export const MAX_DEMO_TITLE_LENGTH = 120;

/** Auto-advance interval for <SlideshowEmbed>, in milliseconds. */
export const SLIDESHOW_ADVANCE_MS = 4000;

// ─── Phase 4.1 — Direct upload constants ────────────────────────────────────

/** Maximum uploaded-file size. 10 MB fits a short demo clip. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * MIME types the upload route accepts. Derived from the renderable
 * `DemoType`s plus a couple of common video containers. The accepted MIME
 * is stored as the R2 object's `Content-Type`, so `<img>` / `<video>`
 * render correctly without sniffing.
 */
export const ALLOWED_UPLOAD_MIME_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime", // .mov
]);
