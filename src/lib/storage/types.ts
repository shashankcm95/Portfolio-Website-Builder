/**
 * Shared types for the R2 (Cloudflare object storage) integration.
 *
 * All user-supplied demo binaries (images / videos / GIFs) land in an R2
 * bucket via the `src/lib/storage/r2.ts` module. The module is the only
 * code that imports `@aws-sdk/client-s3` — everything else reads through
 * the types + helpers here.
 */

export interface R2Config {
  /** Cloudflare account id. Used to construct the R2 endpoint URL. */
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /**
   * Absolute public URL under which objects are served. Either the R2.dev
   * auto-generated one (`https://pub-<hash>.r2.dev`) OR a user-configured
   * custom domain. No trailing slash.
   *
   * The raw S3 endpoint (`https://<acct>.r2.cloudflarestorage.com/<bucket>/`)
   * does NOT work for `<img src>` because it requires signed requests even
   * for public objects. Hence we force an explicit public URL.
   */
  publicBaseUrl: string;
}

export type R2ConfigResult =
  | { configured: true; config: R2Config }
  | { configured: false; reason: string };

export interface UploadFileInput {
  userId: string;
  projectId: string;
  file: File;
}

export interface StorageUploadResult {
  /** Absolute URL suitable for `<img src>`, under `publicBaseUrl`. */
  url: string;
  /** Bucket-relative key (e.g. `u/<uuid>/p/<uuid>/<uuid>.png`). */
  key: string;
  /** Content-Type stored on the object — always from the MIME allowlist. */
  contentType: string;
  bytes: number;
}
