import { render, screen } from "@testing-library/react";
import { AuthorshipChip } from "@/components/github/authorship-chip";
import type {
  AuthorshipSignal,
  AuthorshipFactor,
} from "@/lib/credibility/types";

function makeSignal(
  verdict: "sustained" | "mixed" | "single-burst",
  positiveCount: number
): AuthorshipSignal {
  const factors: AuthorshipFactor[] = [
    {
      name: "commitDays",
      verdict: positiveCount >= 1 ? "positive" : "negative",
      reason: "Active on 30 days.",
    },
    {
      name: "messageQuality",
      verdict: "negative",
      reason: "Most messages are short.",
    },
    {
      name: "collaboration",
      verdict: positiveCount >= 2 ? "positive" : "negative",
      reason: "2 contributors.",
    },
    {
      name: "releases",
      verdict: "negative",
      reason: "No tagged releases.",
    },
    {
      name: "externalPresence",
      verdict: positiveCount >= 3 ? "positive" : "negative",
      reason: "Has homepage.",
    },
    {
      name: "ageVsPush",
      verdict: "neutral",
      reason: "Young but active.",
    },
  ];
  return { status: "ok", verdict, positiveCount, factors };
}

describe("<AuthorshipChip />", () => {
  it("returns null when signal is null or undefined", () => {
    const { container: c1 } = render(<AuthorshipChip signal={null} />);
    const { container: c2 } = render(<AuthorshipChip signal={undefined} />);
    expect(c1.firstChild).toBeNull();
    expect(c2.firstChild).toBeNull();
  });

  it("returns null when signal status is 'missing'", () => {
    const { container } = render(
      <AuthorshipChip signal={{ status: "missing", reason: "no data" }} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("compact mode renders sustained verdict with positive count", () => {
    render(
      <AuthorshipChip compact signal={makeSignal("sustained", 5)} />
    );
    expect(screen.getByTestId("authorship-chip-compact")).toBeInTheDocument();
    expect(screen.getByText(/Sustained development/i)).toBeInTheDocument();
    expect(screen.getByText(/5\/6/)).toBeInTheDocument();
  });

  it("compact mode renders mixed verdict", () => {
    render(
      <AuthorshipChip compact signal={makeSignal("mixed", 2)} />
    );
    expect(screen.getByText(/Mixed signals/i)).toBeInTheDocument();
    expect(screen.getByText(/2\/6/)).toBeInTheDocument();
  });

  it("compact mode renders single-burst verdict", () => {
    render(
      <AuthorshipChip compact signal={makeSignal("single-burst", 0)} />
    );
    expect(screen.getByText(/Single-burst repo/i)).toBeInTheDocument();
    expect(screen.getByText(/0\/6/)).toBeInTheDocument();
  });

  it("full mode renders each factor row with its reason", () => {
    render(<AuthorshipChip signal={makeSignal("mixed", 2)} />);
    expect(screen.getByTestId("authorship-chip-full")).toBeInTheDocument();
    expect(screen.getByText(/Commit cadence/i)).toBeInTheDocument();
    expect(screen.getByText(/Active on 30 days./)).toBeInTheDocument();
    expect(screen.getByText(/No tagged releases./)).toBeInTheDocument();
    expect(screen.getByText(/Most messages are short./)).toBeInTheDocument();
  });

  it("compact badge has an accessible aria-label describing the verdict", () => {
    render(
      <AuthorshipChip compact signal={makeSignal("sustained", 5)} />
    );
    const chip = screen.getByTestId("authorship-chip-compact");
    expect(chip.getAttribute("aria-label")).toMatch(/Sustained development/i);
    expect(chip.getAttribute("aria-label")).toMatch(/5 of 6 factors positive/i);
  });
});
