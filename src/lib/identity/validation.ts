/**
 * Phase C — Validation schemas for the identity + testimonials editor.
 *
 * These are all Tier-1 fields in the editability model: user-authored
 * text or user-curated lists that carry no evaluation risk. The API
 * uses these schemas with `.safeParse()` and returns the issues as
 * part of the error shape so the client can surface field-level errors.
 */

import { z } from "zod";

// ─── Shared constants ─────────────────────────────────────────────────────────

/** Hero positioning: one sentence. 10 lower-bound stops accidental empties;
 *  140 upper-bound keeps it on one line across templates. */
export const POSITIONING_MIN = 10;
export const POSITIONING_MAX = 140;

/** Employer name brevity — "Apple" not "Apple, Inc. (NASDAQ: AAPL)". */
export const EMPLOYER_MAX = 80;
export const EMPLOYER_LIST_MAX = 10;

/** CTA copy defaults in the template carry enough weight — user overrides are
 *  optional and short. */
export const CTA_TEXT_MAX = 60;

/** Testimonial quote cap. 400 chars fits the pull-quote layouts without
 *  forcing scrolling or wrapping onto too many lines. */
export const QUOTE_MAX = 400;
export const AUTHOR_NAME_MAX = 80;
export const AUTHOR_META_MAX = 120;

// ─── Identity PATCH body ──────────────────────────────────────────────────────

/**
 * Partial — every field is independently optional. The route merges only
 * the provided keys into the portfolio row; omitted keys are left alone.
 *
 * `null` is the explicit "clear this field" signal. Tier-1 fields like
 * `positioning` and `hireCtaHref` treat `null` as removal; `namedEmployers`
 * accepts `[]` to clear (null would be ambiguous against an "untouched"
 * signal).
 */
export const identityPatchSchema = z
  .object({
    positioning: z
      .string()
      .trim()
      .min(POSITIONING_MIN, `Positioning must be at least ${POSITIONING_MIN} characters`)
      .max(POSITIONING_MAX, `Positioning must be at most ${POSITIONING_MAX} characters`)
      .nullable()
      .optional(),
    namedEmployers: z
      .array(
        z
          .string()
          .trim()
          .min(1, "Employer name is required")
          .max(EMPLOYER_MAX, `Employer name must be at most ${EMPLOYER_MAX} characters`)
      )
      .max(EMPLOYER_LIST_MAX, `Keep the list to ${EMPLOYER_LIST_MAX} or fewer`)
      .optional(),
    hireStatus: z
      .enum(["available", "open", "not-looking"])
      .optional(),
    hireCtaText: z
      .string()
      .trim()
      .max(CTA_TEXT_MAX, `CTA text must be at most ${CTA_TEXT_MAX} characters`)
      .nullable()
      .optional(),
    hireCtaHref: z
      .string()
      .trim()
      // Allow mailto:, https:, relative paths like /contact, or null to clear
      .refine(
        (v) =>
          v === "" ||
          /^mailto:/i.test(v) ||
          /^https?:\/\//i.test(v) ||
          v.startsWith("/"),
        "CTA link must be an https URL, a mailto:, or a relative path"
      )
      .nullable()
      .optional(),
    // Tier 3 in the editability model — user can override with an explicit
    // { value, unit } pair but can't type arbitrary freeform prose into
    // them. Frontend should populate this dropdown from ranked candidates
    // (see `deriveAnchorStat` in profile-data.ts).
    anchorStatOverride: z
      .object({
        value: z.string().trim().min(1).max(30),
        unit: z.string().trim().min(1).max(60),
        context: z.string().trim().max(140).optional(),
        sourceRef: z.string().trim().max(500).optional(),
      })
      .nullable()
      .optional(),
  })
  .strict();

export type IdentityPatch = z.infer<typeof identityPatchSchema>;

// ─── Testimonial schemas ──────────────────────────────────────────────────────

const urlOrNull = z
  .string()
  .trim()
  .refine(
    (v) => v === "" || /^https?:\/\//i.test(v),
    "Must be an https URL"
  )
  .nullable()
  .optional();

export const testimonialCreateSchema = z
  .object({
    quote: z
      .string()
      .trim()
      .min(5, "Quote is too short")
      .max(QUOTE_MAX, `Quote must be at most ${QUOTE_MAX} characters`),
    authorName: z
      .string()
      .trim()
      .min(1, "Author name is required")
      .max(AUTHOR_NAME_MAX, `Author name must be at most ${AUTHOR_NAME_MAX} characters`),
    authorTitle: z
      .string()
      .trim()
      .max(AUTHOR_META_MAX)
      .optional()
      .nullable(),
    authorCompany: z
      .string()
      .trim()
      .max(AUTHOR_META_MAX)
      .optional()
      .nullable(),
    authorUrl: urlOrNull,
    avatarUrl: urlOrNull,
    displayOrder: z.number().int().min(0).max(1000).optional(),
    isVisible: z.boolean().optional(),
  })
  .strict();

// PATCH allows any subset. We also allow every field to be cleared with null.
export const testimonialPatchSchema = testimonialCreateSchema.partial();

export type TestimonialCreate = z.infer<typeof testimonialCreateSchema>;
export type TestimonialPatch = z.infer<typeof testimonialPatchSchema>;
