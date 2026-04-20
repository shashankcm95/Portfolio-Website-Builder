/**
 * Storyboard schema — the structured output shape for Phase 3's Guided Tour.
 *
 * The LLM emits a `StoryboardPayload`: 6 cards + a mermaid architecture
 * diagram. Each card can carry 0-3 claims, and every claim MUST carry a
 * `VerifierSpec` — claims without a verifier are dropped by post-processing
 * (enforces the "no silent trust" invariant).
 *
 * Zod is the single source of truth; TypeScript types are inferred from
 * schemas so we never drift between runtime validation and compile-time
 * types.
 */

import { z } from "zod";

// ─── Verifier spec — discriminated union by `kind` ──────────────────────────

export const verifierSpecSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("dep"),
    package: z.string().min(1),
    ecosystem: z.enum(["npm", "pypi", "cargo", "go"]).optional(),
  }),
  z.object({
    kind: z.literal("file"),
    glob: z.string().min(1),
  }),
  z.object({
    kind: z.literal("workflow"),
    category: z.enum(["test", "deploy", "lint", "security", "release"]),
  }),
  z.object({
    kind: z.literal("grep"),
    pattern: z.string().min(1),
    sources: z
      .array(z.enum(["readme", "file_tree", "dependencies"]))
      .min(1),
  }),
]);

export type VerifierSpec = z.infer<typeof verifierSpecSchema>;

// ─── Claim ──────────────────────────────────────────────────────────────────

export const claimStatusSchema = z.enum(["verified", "flagged", "pending"]);
export type ClaimStatus = z.infer<typeof claimStatusSchema>;

/**
 * A single falsifiable claim. `verifier` is required — the whole point of
 * Phase 3 is that we re-check every assertion deterministically. `status`
 * is stamped by the verifier at runtime, not by the LLM (we ignore any
 * status the LLM emits).
 */
export const verifiedClaimSchema = z.object({
  label: z.string().min(1).max(120),
  verifier: verifierSpecSchema,
  // LLM fills `status` with "pending"; verifier overwrites. Accept anything
  // on parse so we can post-process cleanly.
  status: claimStatusSchema.optional(),
  evidence: z.string().optional(),
});

export type VerifiedClaim = z.infer<typeof verifiedClaimSchema>;

// ─── Card extras — per-card specialization ──────────────────────────────────

const fileSnippetExtraSchema = z.object({
  kind: z.literal("file_snippet"),
  path: z.string().min(1),
  snippet: z.string().min(1).max(2000),
  language: z.string().min(1),
});

const demoExtraSchema = z.object({
  kind: z.literal("demo"),
  url: z.string().url().optional(),
  cloneCommand: z.string().optional(),
});

export const cardExtraSchema = z.discriminatedUnion("kind", [
  fileSnippetExtraSchema,
  demoExtraSchema,
]);

export type CardExtra = z.infer<typeof cardExtraSchema>;

// ─── Card IDs ───────────────────────────────────────────────────────────────

export const cardIdSchema = z.enum([
  "what",
  "how",
  "interesting_file",
  "tested",
  "deploys",
  "try_it",
]);

export type CardId = z.infer<typeof cardIdSchema>;

/** Canonical fixed order — the UI depends on this being stable. */
export const CARD_ORDER: readonly CardId[] = [
  "what",
  "how",
  "interesting_file",
  "tested",
  "deploys",
  "try_it",
] as const;

// ─── Card ───────────────────────────────────────────────────────────────────

export const storyboardCardSchema = z.object({
  id: cardIdSchema,
  icon: z.string().min(1).max(40), // lucide icon name, e.g. "Lightbulb"
  title: z.string().min(1).max(80),
  description: z.string().min(1).max(400),
  claims: z.array(verifiedClaimSchema).max(5), // post-drop we cap at 3 per card
  extra: cardExtraSchema.optional(),
});

export type StoryboardCard = z.infer<typeof storyboardCardSchema>;

// ─── Payload ────────────────────────────────────────────────────────────────

export const STORYBOARD_SCHEMA_VERSION = 1 as const;

export const storyboardPayloadSchema = z
  .object({
    schemaVersion: z.literal(STORYBOARD_SCHEMA_VERSION),
    cards: z
      .array(storyboardCardSchema)
      .length(6, { message: "Storyboard must have exactly 6 cards" }),
    mermaid: z.string().min(1),
  })
  .superRefine((payload, ctx) => {
    // Enforce canonical card order and uniqueness
    const seen = new Set<CardId>();
    payload.cards.forEach((card, i) => {
      if (seen.has(card.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["cards", i, "id"],
          message: `Duplicate card id: ${card.id}`,
        });
      }
      seen.add(card.id);
      if (card.id !== CARD_ORDER[i]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["cards", i, "id"],
          message: `Expected card ${CARD_ORDER[i]} at position ${i}, got ${card.id}`,
        });
      }
    });
  });

export type StoryboardPayload = z.infer<typeof storyboardPayloadSchema>;

// ─── OpenAI-compatible JSON schema for strict structured output ─────────────

/**
 * Hand-written JSON schema matching the Zod above, suitable for OpenAI's
 * `response_format: { type: "json_schema", strict: true }`.
 *
 * We hand-write this rather than using a zod-to-json-schema converter
 * because OpenAI's strict mode has tight restrictions (no `anyOf` with
 * discriminators, `additionalProperties: false` required everywhere, all
 * fields in `required`). This stays small and predictable.
 */
export const STORYBOARD_JSON_SCHEMA = {
  name: "storyboard_payload",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["schemaVersion", "cards", "mermaid"],
    properties: {
      schemaVersion: { type: "number", enum: [1] },
      mermaid: { type: "string" },
      cards: {
        type: "array",
        minItems: 6,
        maxItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "icon", "title", "description", "claims"],
          properties: {
            id: {
              type: "string",
              enum: [
                "what",
                "how",
                "interesting_file",
                "tested",
                "deploys",
                "try_it",
              ],
            },
            icon: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            claims: {
              type: "array",
              maxItems: 5,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["label", "verifier"],
                properties: {
                  label: { type: "string" },
                  evidence: { type: "string" },
                  verifier: {
                    type: "object",
                    additionalProperties: false,
                    required: ["kind"],
                    properties: {
                      kind: {
                        type: "string",
                        enum: ["dep", "file", "workflow", "grep"],
                      },
                      package: { type: "string" },
                      ecosystem: {
                        type: "string",
                        enum: ["npm", "pypi", "cargo", "go"],
                      },
                      glob: { type: "string" },
                      category: {
                        type: "string",
                        enum: [
                          "test",
                          "deploy",
                          "lint",
                          "security",
                          "release",
                        ],
                      },
                      pattern: { type: "string" },
                      sources: {
                        type: "array",
                        items: {
                          type: "string",
                          enum: ["readme", "file_tree", "dependencies"],
                        },
                      },
                    },
                  },
                },
              },
            },
            extra: {
              type: "object",
              additionalProperties: false,
              required: ["kind"],
              properties: {
                kind: { type: "string", enum: ["file_snippet", "demo"] },
                path: { type: "string" },
                snippet: { type: "string" },
                language: { type: "string" },
                url: { type: "string" },
                cloneCommand: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
} as const;

// ─── Phase 4 — user-demo merge helper ───────────────────────────────────────

import type { DemoRenderMode } from "@/lib/demos/types";

/**
 * Overlay a user-supplied demo onto the LLM-emitted storyboard.
 *
 * When the user has attached a demo to the project, we want Card 6
 * ("Try it") to reflect THEIR choice — not whatever the LLM inferred from
 * the repo's `homepage` metadata. The merge runs at render boundaries
 * (never persisted) so regenerating the storyboard doesn't require
 * touching the user's demo, and clearing the user's demo restores the
 * LLM's original suggestion.
 *
 * Rules:
 *   - `renderMode.kind === "none"` → return payload unchanged.
 *   - otherwise: on Card 6, rewrite `extra` to carry the user demo's URL
 *     while preserving any `cloneCommand` the LLM supplied — "here's the
 *     demo AND here's how to clone" both survive.
 *
 * The merged payload keeps the `userDemo` flag at runtime via a Symbol so
 * downstream consumers (the `<StoryboardCard>` renderer) can detect and
 * render `<ProjectDemo>` inline.
 */
export function applyUserDemoToStoryboard(
  payload: StoryboardPayload,
  renderMode: DemoRenderMode
): StoryboardPayload {
  if (renderMode.kind === "none") return payload;

  // Use the first demo URL as the "try it" link (works for single-mode
  // AND slideshow — for slideshow the UI renders inline, the URL is the
  // canonical fallback if the iframe embed fails).
  const primaryUrl =
    renderMode.kind === "single"
      ? renderMode.demo.url
      : renderMode.demos[0]?.url;
  if (!primaryUrl) return payload;

  const cards = payload.cards.map((card) => {
    if (card.id !== "try_it") return card;

    const existingCloneCommand =
      card.extra && card.extra.kind === "demo"
        ? card.extra.cloneCommand
        : undefined;

    return {
      ...card,
      extra: {
        kind: "demo" as const,
        url: primaryUrl,
        cloneCommand: existingCloneCommand,
      },
    };
  });

  return { ...payload, cards };
}
