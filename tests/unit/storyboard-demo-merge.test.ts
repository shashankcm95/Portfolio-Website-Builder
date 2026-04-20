import {
  applyUserDemoToStoryboard,
  type StoryboardPayload,
} from "@/lib/ai/schemas/storyboard";
import type { DemoRenderMode, ResolvedDemo } from "@/lib/demos/types";

function resolved(
  partial: Partial<ResolvedDemo> & { url: string }
): ResolvedDemo {
  return {
    id: "d1",
    type: "image",
    title: null,
    order: 0,
    embedUrl: null,
    isEmbeddable: true,
    ...partial,
  };
}

function makeCard(id: StoryboardPayload["cards"][number]["id"]) {
  return {
    id,
    icon: "Lightbulb",
    title: `title ${id}`,
    description: "desc",
    claims: [],
  } as StoryboardPayload["cards"][number];
}

function makePayload(
  tryItExtra?: StoryboardPayload["cards"][number]["extra"]
): StoryboardPayload {
  const cards = [
    makeCard("what"),
    makeCard("how"),
    makeCard("interesting_file"),
    makeCard("tested"),
    makeCard("deploys"),
    { ...makeCard("try_it"), extra: tryItExtra },
  ] as StoryboardPayload["cards"];
  return {
    schemaVersion: 1,
    cards,
    mermaid: "graph TD",
  };
}

describe("applyUserDemoToStoryboard", () => {
  it("passes payload through when renderMode is 'none'", () => {
    const input = makePayload({
      kind: "demo",
      url: "https://llm-guessed.example.com",
    });
    const output = applyUserDemoToStoryboard(input, { kind: "none" });
    expect(output).toEqual(input);
  });

  it("overrides Card 6 URL when renderMode is 'single'", () => {
    const input = makePayload({
      kind: "demo",
      url: "https://llm-guessed.example.com",
      cloneCommand: "git clone https://github.com/acme/demo",
    });
    const mode: DemoRenderMode = {
      kind: "single",
      demo: resolved({ url: "https://user.example.com/demo" }),
    };
    const output = applyUserDemoToStoryboard(input, mode);
    const tryItCard = output.cards.find((c) => c.id === "try_it")!;
    expect(tryItCard.extra).toEqual({
      kind: "demo",
      url: "https://user.example.com/demo",
      cloneCommand: "git clone https://github.com/acme/demo",
    });
  });

  it("uses the FIRST demo URL when renderMode is 'slideshow'", () => {
    const input = makePayload();
    const mode: DemoRenderMode = {
      kind: "slideshow",
      demos: [
        resolved({ id: "1", url: "https://cdn.example.com/1.png", order: 0 }),
        resolved({ id: "2", url: "https://cdn.example.com/2.png", order: 1 }),
      ],
    };
    const output = applyUserDemoToStoryboard(input, mode);
    const tryItCard = output.cards.find((c) => c.id === "try_it")!;
    expect(tryItCard.extra).toMatchObject({
      url: "https://cdn.example.com/1.png",
    });
  });

  it("preserves other cards verbatim", () => {
    const input = makePayload({
      kind: "demo",
      url: "https://llm-guessed.example.com",
    });
    const mode: DemoRenderMode = {
      kind: "single",
      demo: resolved({ url: "https://user.example.com/demo" }),
    };
    const output = applyUserDemoToStoryboard(input, mode);
    // Non-"try_it" cards identical
    for (const id of [
      "what",
      "how",
      "interesting_file",
      "tested",
      "deploys",
    ] as const) {
      const inputCard = input.cards.find((c) => c.id === id);
      const outputCard = output.cards.find((c) => c.id === id);
      expect(outputCard).toEqual(inputCard);
    }
  });

  it("creates an extra from scratch when Card 6 had none", () => {
    const input = makePayload(undefined);
    const mode: DemoRenderMode = {
      kind: "single",
      demo: resolved({ url: "https://user.example.com/demo" }),
    };
    const output = applyUserDemoToStoryboard(input, mode);
    const tryItCard = output.cards.find((c) => c.id === "try_it")!;
    expect(tryItCard.extra).toEqual({
      kind: "demo",
      url: "https://user.example.com/demo",
      cloneCommand: undefined,
    });
  });

  it("drops LLM url when card had only url (no cloneCommand)", () => {
    const input = makePayload({
      kind: "demo",
      url: "https://llm-guess.example",
    });
    const mode: DemoRenderMode = {
      kind: "single",
      demo: resolved({ url: "https://user.example" }),
    };
    const output = applyUserDemoToStoryboard(input, mode);
    const tryItCard = output.cards.find((c) => c.id === "try_it")!;
    expect(tryItCard.extra).toEqual({
      kind: "demo",
      url: "https://user.example",
      cloneCommand: undefined,
    });
  });
});
