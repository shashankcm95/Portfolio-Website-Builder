import { render, screen } from "@testing-library/react";
import { StoryboardCard } from "@/components/pipeline/storyboard-card";
import type { StoryboardCard as CardModel } from "@/lib/ai/schemas/storyboard";

function makeCard(overrides: Partial<CardModel> = {}): CardModel {
  return {
    id: "what",
    icon: "Lightbulb",
    title: "Test title",
    description: "Test description",
    claims: [
      {
        label: "Uses Next.js",
        verifier: { kind: "dep", package: "next" },
        status: "verified",
        evidence: "next in npm",
      },
    ],
    ...overrides,
  };
}

describe("<StoryboardCard />", () => {
  it("renders title and description", () => {
    render(<StoryboardCard card={makeCard()} />);
    expect(screen.getByText("Test title")).toBeInTheDocument();
    expect(screen.getByText("Test description")).toBeInTheDocument();
  });

  it("renders claim chips when claims are present", () => {
    render(<StoryboardCard card={makeCard()} />);
    expect(screen.getByText("Uses Next.js")).toBeInTheDocument();
  });

  it("renders a placeholder when claims are empty", () => {
    render(<StoryboardCard card={makeCard({ claims: [] })} />);
    expect(screen.getByTestId("claim-placeholder")).toBeInTheDocument();
    expect(screen.getByText(/Auto-verification unavailable/i)).toBeInTheDocument();
  });

  it("renders a file_snippet extra when provided", () => {
    render(
      <StoryboardCard
        card={makeCard({
          id: "interesting_file",
          extra: {
            kind: "file_snippet",
            path: "src/lib/auth.ts",
            snippet: "export const x = 1;",
            language: "ts",
          },
        })}
      />
    );
    expect(screen.getByTestId("file-snippet")).toBeInTheDocument();
    expect(screen.getByText("src/lib/auth.ts")).toBeInTheDocument();
    expect(screen.getByText(/export const x/)).toBeInTheDocument();
  });

  it("renders a demo URL when provided", () => {
    render(
      <StoryboardCard
        card={makeCard({
          id: "try_it",
          extra: { kind: "demo", url: "https://example.com" },
        })}
      />
    );
    expect(screen.getByTestId("demo-extra")).toBeInTheDocument();
    const link = screen.getByText(/Open live demo/i).closest("a");
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("renders a clone command when demo URL is absent", () => {
    render(
      <StoryboardCard
        card={makeCard({
          id: "try_it",
          extra: {
            kind: "demo",
            cloneCommand: "git clone https://github.com/a/b",
          },
        })}
      />
    );
    expect(
      screen.getByText(/git clone https:\/\/github\.com\/a\/b/)
    ).toBeInTheDocument();
  });

  it("tags the card with data-card-id", () => {
    render(<StoryboardCard card={makeCard({ id: "tested" })} />);
    expect(screen.getByTestId("storyboard-card")).toHaveAttribute(
      "data-card-id",
      "tested"
    );
  });

  it("renders slotBelow content when provided", () => {
    render(
      <StoryboardCard
        card={makeCard({ id: "how" })}
        slotBelow={<div data-testid="injected">INJECTED</div>}
      />
    );
    expect(screen.getByTestId("injected")).toBeInTheDocument();
  });
});
