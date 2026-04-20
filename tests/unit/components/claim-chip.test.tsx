import { render, screen } from "@testing-library/react";
import { ClaimChip } from "@/components/pipeline/claim-chip";
import type { VerifiedClaim } from "@/lib/ai/schemas/storyboard";

function makeClaim(
  status: "verified" | "flagged" | "pending",
  evidence?: string
): VerifiedClaim {
  return {
    label: "Uses Next.js",
    verifier: { kind: "dep", package: "next" },
    status,
    evidence,
  };
}

describe("<ClaimChip />", () => {
  it("renders the label", () => {
    render(<ClaimChip claim={makeClaim("verified", "next in npm")} />);
    expect(screen.getByText("Uses Next.js")).toBeInTheDocument();
  });

  it("applies a verified style when status=verified", () => {
    render(<ClaimChip claim={makeClaim("verified")} />);
    const chip = screen.getByTestId("claim-chip");
    expect(chip).toHaveAttribute("data-status", "verified");
    expect(chip.className).toMatch(/emerald/);
  });

  it("applies a flagged style when status=flagged", () => {
    render(<ClaimChip claim={makeClaim("flagged")} />);
    const chip = screen.getByTestId("claim-chip");
    expect(chip).toHaveAttribute("data-status", "flagged");
    expect(chip.className).toMatch(/amber/);
  });

  it("applies a pending style when status=pending", () => {
    render(<ClaimChip claim={makeClaim("pending")} />);
    const chip = screen.getByTestId("claim-chip");
    expect(chip).toHaveAttribute("data-status", "pending");
  });

  it("exposes an accessible aria-label describing the claim + status", () => {
    render(<ClaimChip claim={makeClaim("verified")} />);
    const chip = screen.getByTestId("claim-chip");
    expect(chip.getAttribute("aria-label")).toMatch(/Uses Next\.js/);
    expect(chip.getAttribute("aria-label")).toMatch(/verified/);
  });

  it("renders an icon appropriate to the status", () => {
    // Just check that an SVG is present — icon choice varies by status
    render(<ClaimChip claim={makeClaim("verified")} />);
    expect(screen.getByTestId("claim-chip").querySelector("svg")).not.toBeNull();
  });
});
