/**
 * Cloudflare R2 object-storage client. Owns all SDK coupling — nothing
 * else imports `@aws-sdk/client-s3`. Consumers use `putObject`,
 * `deleteObject`, `isOurObject` against this module so the storage
 * backend stays swappable.
 *
 * R2 is S3-compatible: we point the standard S3 client at R2's endpoint
 * and it just works. Config comes from env vars (all `R2_*`). Missing any
 * required var → the feature degrades gracefully (upload button stays
 * disabled, cleanup becomes a no-op).
 */

import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  MAX_UPLOAD_BYTES,
} from "@/lib/demos/types";
import type {
  R2Config,
  R2ConfigResult,
  StorageUploadResult,
  UploadFileInput,
} from "@/lib/storage/types";
import { logger } from "@/lib/log";

// ─── Config ────────────────────────────────────────────────────────────────

let cachedConfig: R2ConfigResult | null = null;

/**
 * Validate + memoize R2 env vars. Returns `configured: false` with a
 * structured reason when any required var is missing — callers can show
 * that reason in the UI's disabled-tooltip state.
 *
 * Memoized per-process. For tests, call `_resetR2ConfigCacheForTests()`.
 */
export function getR2Config(): R2ConfigResult {
  if (cachedConfig) return cachedConfig;

  const missing = (name: string): R2ConfigResult => ({
    configured: false,
    reason: `Missing ${name}`,
  });

  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  if (!accountId) return (cachedConfig = missing("R2_ACCOUNT_ID"));

  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  if (!accessKeyId) return (cachedConfig = missing("R2_ACCESS_KEY_ID"));

  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  if (!secretAccessKey)
    return (cachedConfig = missing("R2_SECRET_ACCESS_KEY"));

  const bucket = process.env.R2_BUCKET?.trim();
  if (!bucket) return (cachedConfig = missing("R2_BUCKET"));

  const rawPublicBase = process.env.R2_PUBLIC_BASE_URL?.trim();
  if (!rawPublicBase)
    return (cachedConfig = missing("R2_PUBLIC_BASE_URL"));

  // Normalize: no trailing slash; must be http(s).
  if (!/^https?:\/\//i.test(rawPublicBase)) {
    return (cachedConfig = {
      configured: false,
      reason: "R2_PUBLIC_BASE_URL must start with http(s)://",
    });
  }
  const publicBaseUrl = rawPublicBase.replace(/\/+$/, "");

  cachedConfig = {
    configured: true,
    config: {
      accountId,
      accessKeyId,
      secretAccessKey,
      bucket,
      publicBaseUrl,
    },
  };
  return cachedConfig;
}

/** For tests: flush the env-var cache so the next `getR2Config()` re-reads. */
export function _resetR2ConfigCacheForTests(): void {
  cachedConfig = null;
  cachedClient = null;
}

// ─── Client ────────────────────────────────────────────────────────────────

let cachedClient: S3Client | null = null;

function getS3Client(cfg: R2Config): S3Client {
  if (cachedClient) return cachedClient;
  cachedClient = new S3Client({
    region: "auto",
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    forcePathStyle: true,
  });
  return cachedClient;
}

// ─── Keys + MIME ───────────────────────────────────────────────────────────

/**
 * MIME → file-extension map. The MIME arrives from `File.type` which is
 * set by the browser from the uploaded file's type. We never trust the
 * filename's extension — everything on disk is named from this allowlist.
 */
const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export function extFromMime(mime: string): string | null {
  return MIME_TO_EXT[mime.toLowerCase()] ?? null;
}

export function buildObjectKey(
  userId: string,
  projectId: string,
  ext: string
): string {
  return `u/${userId}/p/${projectId}/${randomUUID()}.${ext.toLowerCase()}`;
}

// ─── Public API ────────────────────────────────────────────────────────────

export class R2UploadError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "not_configured"
      | "too_large"
      | "bad_mime"
      | "missing_file"
      | "put_failed"
  ) {
    super(message);
    this.name = "R2UploadError";
  }
}

/**
 * Upload a single `File` to R2. Throws `R2UploadError` for all predictable
 * failure modes (caller maps to HTTP status).
 */
export async function putObject(
  input: UploadFileInput
): Promise<StorageUploadResult> {
  const cfg = getR2Config();
  if (!cfg.configured) {
    throw new R2UploadError(
      `R2 not configured: ${cfg.reason}`,
      "not_configured"
    );
  }

  const { file, userId, projectId } = input;

  if (!file || file.size === 0) {
    throw new R2UploadError("No file provided", "missing_file");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new R2UploadError(
      `File exceeds ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB limit`,
      "too_large"
    );
  }

  const mime = file.type.toLowerCase();
  if (!ALLOWED_UPLOAD_MIME_TYPES.has(mime)) {
    throw new R2UploadError(
      `Unsupported file type: ${file.type || "unknown"}`,
      "bad_mime"
    );
  }

  const ext = extFromMime(mime);
  if (!ext) {
    // Unreachable given the allowlist check above, but TS belt-and-suspenders.
    throw new R2UploadError(
      `No extension mapping for ${mime}`,
      "bad_mime"
    );
  }

  const key = buildObjectKey(userId, projectId, ext);
  const body = Buffer.from(await file.arrayBuffer());

  const client = getS3Client(cfg.config);
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: cfg.config.bucket,
        Key: key,
        Body: body,
        ContentType: mime,
        CacheControl: "public, max-age=31536000, immutable",
      })
    );
  } catch (e) {
    throw new R2UploadError(
      `R2 upload failed: ${e instanceof Error ? e.message : String(e)}`,
      "put_failed"
    );
  }

  return {
    url: `${cfg.config.publicBaseUrl}/${key}`,
    key,
    contentType: mime,
    bytes: file.size,
  };
}

/**
 * Does `url` point at an object in OUR R2 bucket? Used by the PUT /demo
 * cleanup diff to decide whether to fire a DeleteObject.
 *
 * Matches by hostname against `publicBaseUrl`'s hostname — we intentionally
 * don't require prefix-matching the path so custom CDN paths still qualify.
 */
export function isOurObject(url: string): boolean {
  const cfg = getR2Config();
  if (!cfg.configured) return false;

  try {
    const target = new URL(url);
    const base = new URL(cfg.config.publicBaseUrl);
    return target.hostname.toLowerCase() === base.hostname.toLowerCase();
  } catch {
    // Either URL is malformed — treat as "not ours" rather than crash.
    return false;
  }
}

/**
 * Best-effort delete. Swallows all errors — callers treat cleanup as
 * non-fatal (R2 outage or transient 500 should not break a demo PUT).
 */
export async function deleteObject(url: string): Promise<void> {
  const cfg = getR2Config();
  if (!cfg.configured) return;

  try {
    const target = new URL(url);
    const base = new URL(cfg.config.publicBaseUrl);
    // Strip the public-base path (if any) from the start of the pathname
    // to recover the bucket-relative key.
    const basePath = base.pathname.replace(/\/+$/, "");
    let key = target.pathname;
    if (basePath && key.startsWith(basePath + "/")) {
      key = key.slice(basePath.length);
    }
    key = key.replace(/^\/+/, "");
    if (!key) return;

    const client = getS3Client(cfg.config);
    await client.send(
      new DeleteObjectCommand({
        Bucket: cfg.config.bucket,
        Key: key,
      })
    );
  } catch (e) {
    // Log and continue — cleanup is best-effort.
    logger.warn("[r2] deleteObject failed", {
      url,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
