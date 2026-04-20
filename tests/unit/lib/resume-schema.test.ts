import { basicsSchema, workSchema } from "@/lib/ai/schemas/resume";

describe("resume schemas — null/undefined preprocessing", () => {
  it("accepts nulls for optional string fields in basics", () => {
    const parsed = basicsSchema.parse({
      name: "Jane Doe",
      label: null,
      email: null,
      phone: null,
      url: null,
      summary: null,
      location: null,
      profiles: null,
    });
    expect(parsed.name).toBe("Jane Doe");
    expect(parsed.email).toBeUndefined();
    expect(parsed.location).toBeUndefined();
    expect(parsed.profiles).toBeUndefined();
  });

  it("rejects missing required name", () => {
    expect(() => basicsSchema.parse({ email: "x@y.com" })).toThrow();
  });

  it("accepts a fully-populated basics object", () => {
    const parsed = basicsSchema.parse({
      name: "Jane",
      label: "Engineer",
      email: "j@example.com",
      phone: "+1234",
      url: "https://jane.dev",
      summary: "Hi",
      location: { city: "Berlin", region: null, country: "DE" },
      profiles: [{ network: "github", username: "jane", url: null }],
    });
    expect(parsed.location?.city).toBe("Berlin");
    expect(parsed.profiles?.[0].network).toBe("github");
  });

  it("preprocesses null highlights to undefined in work", () => {
    const parsed = workSchema.parse({
      company: "Acme",
      position: "Engineer",
      startDate: "2020-01",
      endDate: null,
      summary: null,
      highlights: null,
    });
    expect(parsed.highlights).toBeUndefined();
  });
});
