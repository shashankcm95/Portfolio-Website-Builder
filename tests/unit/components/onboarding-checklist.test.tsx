import { render, screen } from "@testing-library/react";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";

// The checklist is a pure server-safe component — no hooks, no network.
// Tests verify the active step logic and link hrefs.

describe("<OnboardingChecklist />", () => {
  it("marks step 1 active when nothing is done", () => {
    render(
      <OnboardingChecklist
        hasResume={false}
        hasPortfolio={false}
        hasProject={false}
      />
    );
    const step = screen.getByText("Upload your resume").closest("a");
    expect(step).toHaveAttribute("aria-current", "step");
  });

  it("marks step 2 active when only resume is done", () => {
    render(
      <OnboardingChecklist
        hasResume={true}
        hasPortfolio={false}
        hasProject={false}
      />
    );
    const step = screen
      .getByText("Create your first portfolio")
      .closest("a");
    expect(step).toHaveAttribute("aria-current", "step");
  });

  it("uses portfolio-specific URL for step 3 when portfolioId provided", () => {
    render(
      <OnboardingChecklist
        hasResume={true}
        hasPortfolio={true}
        hasProject={false}
        portfolioId="abc-123"
      />
    );
    const step = screen.getByText("Add a GitHub repo").closest("a");
    expect(step).toHaveAttribute("href", "/portfolios/abc-123?tab=projects");
  });

  it("falls back to /portfolios when no portfolioId", () => {
    render(
      <OnboardingChecklist
        hasResume={true}
        hasPortfolio={false}
        hasProject={false}
      />
    );
    const step = screen.getByText("Add a GitHub repo").closest("a");
    expect(step).toHaveAttribute("href", "/portfolios");
  });

  it("shows a completion counter that reflects done steps", () => {
    render(
      <OnboardingChecklist
        hasResume={true}
        hasPortfolio={true}
        hasProject={false}
      />
    );
    expect(screen.getByText("2/3")).toBeInTheDocument();
  });

  it("strikes through completed step titles", () => {
    render(
      <OnboardingChecklist
        hasResume={true}
        hasPortfolio={false}
        hasProject={false}
      />
    );
    const done = screen.getByText("Upload your resume");
    expect(done.className).toMatch(/line-through/);
  });
});
