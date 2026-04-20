import { render, screen, fireEvent } from "@testing-library/react";
import { NextStepBanner } from "@/components/ui/next-step-banner";

describe("<NextStepBanner />", () => {
  it("renders title and CTA label", () => {
    render(
      <NextStepBanner
        title="Resume parsed!"
        description="Next: create your first portfolio."
        cta="Create Portfolio"
        href="/portfolios/new"
      />
    );
    expect(screen.getByText("Resume parsed!")).toBeInTheDocument();
    expect(
      screen.getByText("Next: create your first portfolio.")
    ).toBeInTheDocument();
    expect(screen.getByText("Create Portfolio")).toBeInTheDocument();
  });

  it("renders a link when href is provided", () => {
    render(
      <NextStepBanner title="Step 2" cta="Go" href="/portfolios/new" />
    );
    const link = screen.getByText("Go").closest("a");
    expect(link).toHaveAttribute("href", "/portfolios/new");
  });

  it("calls onCtaClick when no href is provided", () => {
    const onCtaClick = jest.fn();
    render(<NextStepBanner title="Step 3" cta="Deploy" onCtaClick={onCtaClick} />);
    fireEvent.click(screen.getByText("Deploy"));
    expect(onCtaClick).toHaveBeenCalledTimes(1);
  });

  it("applies a distinct tone class for success vs info", () => {
    const { rerender, container } = render(
      <NextStepBanner title="Info" cta="Go" href="/x" tone="info" />
    );
    const infoBanner = container.querySelector('[data-testid="next-step-banner"]');
    expect(infoBanner?.className).toMatch(/bg-blue-50/);

    rerender(
      <NextStepBanner title="Success" cta="Go" href="/x" tone="success" />
    );
    const successBanner = container.querySelector(
      '[data-testid="next-step-banner"]'
    );
    expect(successBanner?.className).toMatch(/bg-emerald-50/);
  });

  it("omits the description paragraph when no description is given", () => {
    render(<NextStepBanner title="Just a title" cta="Go" href="/x" />);
    expect(screen.getByText("Just a title")).toBeInTheDocument();
    // Only one paragraph (the title) should be present under the banner
    const paras = screen
      .getByTestId("next-step-banner")
      .querySelectorAll("p");
    expect(paras).toHaveLength(1);
  });
});
