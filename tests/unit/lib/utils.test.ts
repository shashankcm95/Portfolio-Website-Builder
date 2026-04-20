import { cn } from "@/lib/utils";

describe("cn", () => {
  it("joins truthy class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("drops falsy values", () => {
    expect(cn("a", false && "hidden", null, undefined, "b")).toBe("a b");
  });

  it("applies tailwind-merge to deduplicate conflicting utilities", () => {
    // twMerge keeps the last conflicting class — e.g. p-4 wins over p-2
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("respects conditional objects", () => {
    expect(cn({ a: true, b: false })).toBe("a");
  });
});
