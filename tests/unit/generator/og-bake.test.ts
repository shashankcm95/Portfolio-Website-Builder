/**
 * @jest-environment node
 */

import type { ProfileData } from "@/templates/_shared/types";

// Mock @vercel/og's ImageResponse so the unit test doesn't depend on
// wasm/native Satori binaries. The real behaviour is exercised end-to-end
// through the existing /api/og route; here we just prove the baker's
// composition + error handling.
jest.mock("@vercel/og", () => {
  const arrayBuffer = jest.fn(async () => new ArrayBuffer(8));
  const ImageResponse = jest.fn(() => ({ arrayBuffer })) as unknown as any;
  (ImageResponse as any).__arrayBuffer = arrayBuffer;
  return { ImageResponse };
});

jest.mock("@/lib/og/layout-portfolio", () => ({
  PortfolioOgLayout: jest.fn((props: unknown) => ({ __mockElement: props })),
}));

import { bakePortfolioOgImage } from "@/lib/generator/og-bake";
import { ImageResponse } from "@vercel/og";
import { PortfolioOgLayout } from "@/lib/og/layout-portfolio";

const MockImageResponse = ImageResponse as unknown as jest.Mock;
const mockArrayBuffer = (ImageResponse as any).__arrayBuffer as jest.Mock;
const MockLayout = PortfolioOgLayout as unknown as jest.Mock;

function fixtureProfile(): ProfileData {
  return {
    meta: {
      generatedAt: "2025-01-01T00:00:00Z",
      templateId: "minimal",
      portfolioSlug: "alice",
      siteUrl: "https://example.com",
    },
    basics: {
      name: "Alice",
      label: "Software engineer",
      summary: "Builds tools for humans.",
      avatar: "https://avatars.githubusercontent.com/u/1?v=4",
      profiles: [],
    },
    skills: [
      { name: "TypeScript", category: "language" },
      { name: "React", category: "framework" },
      { name: "Postgres", category: "framework" },
      { name: "Docker", category: "tool" },
    ],
    projects: [],
  };
}

describe("bakePortfolioOgImage", () => {
  beforeEach(() => {
    MockImageResponse.mockClear();
    mockArrayBuffer.mockClear();
    mockArrayBuffer.mockResolvedValue(new ArrayBuffer(8));
    MockLayout.mockClear();
  });

  it("returns a Buffer for a valid profile", async () => {
    const buf = await bakePortfolioOgImage(fixtureProfile());
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf && buf.length).toBeGreaterThan(0);
    expect(MockImageResponse).toHaveBeenCalledTimes(1);
  });

  it("forwards only the top 3 skills to the layout (matches /api/og shape)", async () => {
    await bakePortfolioOgImage(fixtureProfile());
    const lastCall = MockLayout.mock.calls.at(-1)?.[0];
    expect(lastCall.topSkills).toEqual(["TypeScript", "React", "Postgres"]);
  });

  it("returns null and warns when ImageResponse throws", async () => {
    MockImageResponse.mockImplementationOnce(() => {
      throw new Error("satori boom");
    });
    // Phase R6.2 migrated this code path from console.warn to logger.warn;
    // the logger routes warn+error to console.error (both stderr), so we
    // spy there to observe emission.
    const warn = jest.spyOn(console, "error").mockImplementation(() => {});
    const buf = await bakePortfolioOgImage(fixtureProfile());
    expect(buf).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns null when arrayBuffer() rejects", async () => {
    mockArrayBuffer.mockRejectedValueOnce(new Error("drain boom"));
    // Phase R6.2 migrated this code path from console.warn to logger.warn;
    // the logger routes warn+error to console.error (both stderr), so we
    // spy there to observe emission.
    const warn = jest.spyOn(console, "error").mockImplementation(() => {});
    const buf = await bakePortfolioOgImage(fixtureProfile());
    expect(buf).toBeNull();
    warn.mockRestore();
  });
});
