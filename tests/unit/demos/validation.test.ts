import {
  demoItemSchema,
  isValidDemoUrl,
  putDemosBodySchema,
} from "@/lib/demos/validation";

describe("demoItemSchema", () => {
  it("accepts a basic https URL", () => {
    expect(
      demoItemSchema.safeParse({
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      }).success
    ).toBe(true);
  });

  it("accepts an optional title", () => {
    expect(
      demoItemSchema.safeParse({
        url: "https://example.com/x.png",
        title: "Screenshot",
      }).success
    ).toBe(true);
  });

  it("allows http URLs", () => {
    expect(
      demoItemSchema.safeParse({ url: "http://example.com/foo" }).success
    ).toBe(true);
  });

  it("rejects javascript: URLs", () => {
    const res = demoItemSchema.safeParse({ url: "javascript:alert(1)" });
    expect(res.success).toBe(false);
  });

  it("rejects data: URLs", () => {
    const res = demoItemSchema.safeParse({
      url: "data:image/png;base64,iVBORw0KGgo=",
    });
    expect(res.success).toBe(false);
  });

  it("rejects file:// URLs", () => {
    const res = demoItemSchema.safeParse({ url: "file:///etc/passwd" });
    expect(res.success).toBe(false);
  });

  it("rejects blob: URLs", () => {
    const res = demoItemSchema.safeParse({ url: "blob:https://example.com/abc" });
    expect(res.success).toBe(false);
  });

  it("rejects vbscript: URLs", () => {
    const res = demoItemSchema.safeParse({ url: "vbscript:msgbox(1)" });
    expect(res.success).toBe(false);
  });

  it("rejects URLs over 2048 chars", () => {
    const long = "https://example.com/" + "a".repeat(2040);
    const res = demoItemSchema.safeParse({ url: long });
    expect(res.success).toBe(false);
  });

  it("rejects empty string", () => {
    expect(demoItemSchema.safeParse({ url: "" }).success).toBe(false);
  });

  it("rejects a title over 120 chars", () => {
    const res = demoItemSchema.safeParse({
      url: "https://example.com/x.png",
      title: "a".repeat(121),
    });
    expect(res.success).toBe(false);
  });
});

describe("putDemosBodySchema", () => {
  it("accepts empty list", () => {
    expect(putDemosBodySchema.safeParse({ demos: [] }).success).toBe(true);
  });

  it("accepts up to 8 demos", () => {
    const demos = Array.from({ length: 8 }, (_, i) => ({
      url: `https://example.com/${i}.png`,
    }));
    expect(putDemosBodySchema.safeParse({ demos }).success).toBe(true);
  });

  it("rejects more than 8 demos", () => {
    const demos = Array.from({ length: 9 }, (_, i) => ({
      url: `https://example.com/${i}.png`,
    }));
    expect(putDemosBodySchema.safeParse({ demos }).success).toBe(false);
  });

  it("rejects if any demo url is invalid", () => {
    const demos = [
      { url: "https://example.com/ok.png" },
      { url: "javascript:alert(1)" },
    ];
    expect(putDemosBodySchema.safeParse({ demos }).success).toBe(false);
  });

  it("rejects if `demos` field is missing", () => {
    expect(putDemosBodySchema.safeParse({}).success).toBe(false);
  });
});

describe("isValidDemoUrl", () => {
  it("is a boolean convenience mirror of demoItemSchema.shape.url", () => {
    expect(isValidDemoUrl("https://example.com/x.png")).toBe(true);
    expect(isValidDemoUrl("javascript:alert(1)")).toBe(false);
    expect(isValidDemoUrl("")).toBe(false);
  });
});
