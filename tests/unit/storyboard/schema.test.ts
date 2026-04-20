import {
  CARD_ORDER,
  storyboardPayloadSchema,
  verifiedClaimSchema,
  verifierSpecSchema,
  STORYBOARD_SCHEMA_VERSION,
} from "@/lib/ai/schemas/storyboard";

function validCard(id: (typeof CARD_ORDER)[number]) {
  return {
    id,
    icon: "Lightbulb",
    title: `Title for ${id}`,
    description: `Description for ${id}`,
    claims: [
      {
        label: "Uses something",
        verifier: { kind: "dep", package: "react" },
      },
    ],
  };
}

function validPayload() {
  return {
    schemaVersion: STORYBOARD_SCHEMA_VERSION,
    mermaid: "graph TD\n  A --> B",
    cards: CARD_ORDER.map(validCard),
  };
}

describe("verifierSpecSchema", () => {
  it("accepts all four kinds", () => {
    expect(
      verifierSpecSchema.safeParse({ kind: "dep", package: "next" }).success
    ).toBe(true);
    expect(
      verifierSpecSchema.safeParse({ kind: "file", glob: "Dockerfile" }).success
    ).toBe(true);
    expect(
      verifierSpecSchema.safeParse({ kind: "workflow", category: "test" }).success
    ).toBe(true);
    expect(
      verifierSpecSchema.safeParse({
        kind: "grep",
        pattern: "^import",
        sources: ["readme"],
      }).success
    ).toBe(true);
  });

  it("rejects unknown kinds", () => {
    expect(
      verifierSpecSchema.safeParse({ kind: "oracle", question: "is it safe?" })
        .success
    ).toBe(false);
  });

  it("rejects a dep spec missing package", () => {
    expect(verifierSpecSchema.safeParse({ kind: "dep" }).success).toBe(false);
  });

  it("rejects a grep spec with empty sources", () => {
    expect(
      verifierSpecSchema.safeParse({
        kind: "grep",
        pattern: "x",
        sources: [],
      }).success
    ).toBe(false);
  });
});

describe("verifiedClaimSchema", () => {
  it("requires a verifier", () => {
    expect(
      verifiedClaimSchema.safeParse({ label: "Floating claim" }).success
    ).toBe(false);
  });

  it("accepts a minimal verified claim", () => {
    expect(
      verifiedClaimSchema.safeParse({
        label: "Uses Drizzle",
        verifier: { kind: "dep", package: "drizzle-orm" },
      }).success
    ).toBe(true);
  });

  it("rejects an empty label", () => {
    expect(
      verifiedClaimSchema.safeParse({
        label: "",
        verifier: { kind: "dep", package: "x" },
      }).success
    ).toBe(false);
  });
});

describe("storyboardPayloadSchema", () => {
  it("accepts a canonical 6-card payload in order", () => {
    const result = storyboardPayloadSchema.safeParse(validPayload());
    expect(result.success).toBe(true);
  });

  it("rejects fewer than 6 cards", () => {
    const payload = validPayload();
    payload.cards = payload.cards.slice(0, 5);
    expect(storyboardPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects more than 6 cards", () => {
    const payload = validPayload();
    payload.cards = [...payload.cards, validCard("what")];
    expect(storyboardPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects cards in the wrong order", () => {
    const payload = validPayload();
    // swap first two
    [payload.cards[0], payload.cards[1]] = [
      payload.cards[1],
      payload.cards[0],
    ];
    expect(storyboardPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects duplicate card ids (even if count is 6)", () => {
    const payload = validPayload();
    // replace the last card with a duplicate of the first
    payload.cards[5] = { ...validCard("what") };
    expect(storyboardPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects missing mermaid", () => {
    const payload = validPayload();
    // @ts-expect-error testing missing field
    delete payload.mermaid;
    expect(storyboardPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects wrong schemaVersion", () => {
    const payload = validPayload();
    (payload as any).schemaVersion = 2;
    expect(storyboardPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it("accepts the extra `file_snippet` on a card", () => {
    const payload = validPayload();
    payload.cards[2] = {
      ...validCard("interesting_file"),
      extra: {
        kind: "file_snippet",
        path: "src/index.ts",
        snippet: "export const x = 1;",
        language: "ts",
      },
    } as any;
    expect(storyboardPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it("accepts the extra `demo` on a card", () => {
    const payload = validPayload();
    payload.cards[5] = {
      ...validCard("try_it"),
      extra: {
        kind: "demo",
        url: "https://example.com",
        cloneCommand: "git clone https://github.com/a/b",
      },
    } as any;
    expect(storyboardPayloadSchema.safeParse(payload).success).toBe(true);
  });
});
