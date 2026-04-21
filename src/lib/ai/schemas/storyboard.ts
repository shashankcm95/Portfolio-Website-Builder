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

/**
 * Phase 3 used a Zod discriminated union so each `kind` has a tight
 * shape. OpenAI strict mode can't express that — it forces a flat
 * object with every property declared (see JSON schema below) and
 * unused ones emitted as `null`. To bridge the two, we parse the
 * flat object with a permissive schema here and let the verifier
 * reject claims whose `kind` is inconsistent with the populated
 * fields at runtime.
 */
export const verifierSpecSchema = z
  .object({
    kind: z.enum(["dep", "file", "workflow", "grep"]),
    // `dep`
    package: z.string().min(1).nullish(),
    ecosystem: z.enum(["npm", "pypi", "cargo", "go"]).nullish(),
    // `file`
    glob: z.string().min(1).nullish(),
    // `workflow`
    category: z
      .enum(["test", "deploy", "lint", "security", "release"])
      .nullish(),
    // `grep`
    pattern: z.string().min(1).nullish(),
    sources: z
      .array(z.enum(["readme", "file_tree", "dependencies"]))
      .min(1)
      .nullish(),
  })
  .superRefine((v, ctx) => {
    // Enforce the per-kind required fields that the discriminated
    // union used to express. Anything that fails here is a contract
    // violation from the LLM and the post-processor drops the claim.
    if (v.kind === "dep" && !v.package) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["package"],
        message: "dep verifier requires package",
      });
    }
    if (v.kind === "file" && !v.glob) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["glob"],
        message: "file verifier requires glob",
      });
    }
    if (v.kind === "workflow" && !v.category) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["category"],
        message: "workflow verifier requires category",
      });
    }
    if (v.kind === "grep" && (!v.pattern || !v.sources?.length)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pattern"],
        message: "grep verifier requires pattern + sources",
      });
    }
  });

export type VerifierSpec = z.infer<typeof verifierSpecSchema>;

/**
 * Narrow per-kind shapes for the runtime verifier dispatcher. We
 * hand-write these because the flat `VerifierSpec` loses the
 * "package is always a string when kind='dep'" guarantee the old
 * discriminated union had — the dispatcher branches on kind and
 * casts to these tighter shapes before calling each verifier.
 */
export type DepVerifier = {
  kind: "dep";
  package: string;
  ecosystem?: "npm" | "pypi" | "cargo" | "go" | null;
};
export type FileVerifier = {
  kind: "file";
  glob: string;
};
export type WorkflowVerifier = {
  kind: "workflow";
  category: "test" | "deploy" | "lint" | "security" | "release";
};
export type GrepVerifier = {
  kind: "grep";
  pattern: string;
  sources: Array<"readme" | "file_tree" | "dependencies">;
};

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
  // on parse so we can post-process cleanly. `.nullish()` because OpenAI
  // strict mode emits missing optionals as `null`.
  status: claimStatusSchema.nullish(),
  evidence: z.string().nullish(),
});

export type VerifiedClaim = z.infer<typeof verifiedClaimSchema>;

// ─── Card extras — per-card specialization ──────────────────────────────────

/**
 * Like the verifier, the card-extra used to be a discriminated union.
 * OpenAI strict mode requires a single flat object (or null) so we
 * parse permissively and enforce the per-kind required fields in a
 * superRefine. Post-processors read `kind` to branch.
 */
export const cardExtraSchema = z
  .object({
    kind: z.enum(["file_snippet", "demo"]),
    // file_snippet-only
    path: z.string().min(1).nullish(),
    snippet: z.string().min(1).max(2000).nullish(),
    language: z.string().min(1).nullish(),
    // demo-only
    url: z.string().url().nullish(),
    cloneCommand: z.string().nullish(),
  })
  .superRefine((e, ctx) => {
    if (e.kind === "file_snippet") {
      if (!e.path)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["path"],
          message: "file_snippet requires path",
        });
      if (!e.snippet)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["snippet"],
          message: "file_snippet requires snippet",
        });
      if (!e.language)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["language"],
          message: "file_snippet requires language",
        });
    }
    // "demo" kind allows all four of url / cloneCommand / null — no
    // required fields. The renderer shows whichever the LLM chose to
    // populate.
  });

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
  // `.nullish()` — OpenAI strict emits null for cards without an extra.
  extra: cardExtraSchema.nullish(),
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
/**
 * OpenAI strict-mode `response_format` requires that every key in
 * `properties` is listed in `required`. Optional fields are expressed
 * as nullable (`type: ["X", "null"]`) rather than omitted from
 * `required`. That's why this schema looks chatty with nulls — the
 * LLM is required to produce the key, but it may emit `null` when
 * the field doesn't apply (e.g. a `file`-kind verifier has no
 * `package`).
 *
 * See: https://platform.openai.com/docs/guides/structured-outputs
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
          // Every property listed here — strict mode requirement.
          required: ["id", "icon", "title", "description", "claims", "extra"],
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
                required: ["label", "evidence", "verifier"],
                properties: {
                  label: { type: "string" },
                  // Optional commentary — nullable, because some claims
                  // are self-evident from `label` alone.
                  evidence: { type: ["string", "null"] },
                  verifier: {
                    type: "object",
                    additionalProperties: false,
                    required: [
                      "kind",
                      "package",
                      "ecosystem",
                      "glob",
                      "category",
                      "pattern",
                      "sources",
                    ],
                    properties: {
                      kind: {
                        type: "string",
                        enum: ["dep", "file", "workflow", "grep"],
                      },
                      // `package` + `ecosystem` apply when kind="dep";
                      // null for other kinds.
                      package: { type: ["string", "null"] },
                      ecosystem: {
                        type: ["string", "null"],
                        enum: ["npm", "pypi", "cargo", "go", null],
                      },
                      // `glob` applies when kind="file"; null otherwise.
                      glob: { type: ["string", "null"] },
                      // `category` applies when kind="workflow".
                      category: {
                        type: ["string", "null"],
                        enum: [
                          "test",
                          "deploy",
                          "lint",
                          "security",
                          "release",
                          null,
                        ],
                      },
                      // `pattern` + `sources` apply when kind="grep".
                      pattern: { type: ["string", "null"] },
                      sources: {
                        type: ["array", "null"],
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
            // Each card carries an optional `extra` payload — null on
            // cards that don't need one; only populated on the
            // "interesting_file" + "try_it" cards in practice.
            extra: {
              anyOf: [
                {
                  type: "object",
                  additionalProperties: false,
                  required: [
                    "kind",
                    "path",
                    "snippet",
                    "language",
                    "url",
                    "cloneCommand",
                  ],
                  properties: {
                    kind: {
                      type: "string",
                      enum: ["file_snippet", "demo"],
                    },
                    // file_snippet-only fields — null for "demo" extras.
                    path: { type: ["string", "null"] },
                    snippet: { type: ["string", "null"] },
                    language: { type: ["string", "null"] },
                    // demo-only fields — null for "file_snippet" extras.
                    url: { type: ["string", "null"] },
                    cloneCommand: { type: ["string", "null"] },
                  },
                },
                { type: "null" },
              ],
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
