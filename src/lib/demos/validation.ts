/**
 * Zod schemas for user-supplied demo input. Used by the API route and the
 * client form; the two share this file so validation is identical at both
 * boundaries.
 *
 * Security posture:
 *   - Only http(s) URLs accepted — `javascript:`, `data:`, `file:`, `blob:`,
 *     `vbscript:` rejected explicitly.
 *   - URL length capped at {@link MAX_DEMO_URL_LENGTH}.
 *   - Title length capped at {@link MAX_DEMO_TITLE_LENGTH}.
 *   - Demo list capped at {@link MAX_DEMOS_PER_PROJECT}.
 */

import { z } from "zod";
import {
  MAX_DEMO_TITLE_LENGTH,
  MAX_DEMO_URL_LENGTH,
  MAX_DEMOS_PER_PROJECT,
} from "@/lib/demos/types";

const DENIED_SCHEMES = [
  "javascript:",
  "data:",
  "file:",
  "blob:",
  "vbscript:",
] as const;

export const demoItemSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, "URL is required")
    .max(MAX_DEMO_URL_LENGTH, `URL must be ${MAX_DEMO_URL_LENGTH} chars or fewer`)
    .url("Must be a valid URL")
    .refine((u) => {
      const lower = u.toLowerCase();
      return !DENIED_SCHEMES.some((scheme) => lower.startsWith(scheme));
    }, "Scheme not allowed")
    .refine(
      (u) => /^https?:\/\//i.test(u),
      "Only http(s) URLs are supported"
    ),
  title: z
    .string()
    .max(MAX_DEMO_TITLE_LENGTH, `Title must be ${MAX_DEMO_TITLE_LENGTH} chars or fewer`)
    .nullable()
    .optional(),
});

export type DemoItemInput = z.infer<typeof demoItemSchema>;

export const putDemosBodySchema = z.object({
  demos: z
    .array(demoItemSchema)
    .max(MAX_DEMOS_PER_PROJECT, `At most ${MAX_DEMOS_PER_PROJECT} demos per project`),
});

export type PutDemosBody = z.infer<typeof putDemosBodySchema>;

/**
 * Cheap predicate for client-side preview — mirrors the `demoItemSchema`
 * refine but returns a boolean instead of throwing, so the form can
 * render per-row "Detected: …" hints without building a Zod error.
 */
export function isValidDemoUrl(url: string): boolean {
  return demoItemSchema.shape.url.safeParse(url).success;
}
