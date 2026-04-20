import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RepoAddForm } from "@/components/github/repo-add-form";

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

async function switchToManualTab() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("tab", { name: /^manual$/i }));
}

describe("<RepoAddForm />", () => {
  it("renders both GitHub and Manual tabs", () => {
    render(<RepoAddForm portfolioId="pf-1" />);
    expect(
      screen.getByRole("tab", { name: /github import/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^manual$/i })).toBeInTheDocument();
  });

  it("switches to the Manual tab when clicked", async () => {
    render(<RepoAddForm portfolioId="pf-1" />);
    await switchToManualTab();
    expect(await screen.findByLabelText(/project name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^description$/i)).toBeInTheDocument();
  });

  it("requires a name on the manual form", async () => {
    render(<RepoAddForm portfolioId="pf-1" />);
    await switchToManualTab();
    fireEvent.click(screen.getByRole("button", { name: /add project/i }));
    await waitFor(() =>
      expect(screen.getByText(/project name is required/i)).toBeInTheDocument()
    );
  });

  it("requires a description on the manual form", async () => {
    render(<RepoAddForm portfolioId="pf-1" />);
    await switchToManualTab();
    fireEvent.change(await screen.findByLabelText(/project name/i), {
      target: { value: "Acme Redesign" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add project/i }));
    await waitFor(() =>
      expect(screen.getByText(/description is required/i)).toBeInTheDocument()
    );
  });

  it("posts manual-project payload with sourceType=manual", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "p1" }),
    });
    global.fetch = fetchMock;

    const onAdded = jest.fn();
    render(<RepoAddForm portfolioId="pf-123" onProjectAdded={onAdded} />);
    await switchToManualTab();

    fireEvent.change(await screen.findByLabelText(/project name/i), {
      target: { value: "Acme Redesign" },
    });
    fireEvent.change(screen.getByLabelText(/^description$/i), {
      target: { value: "A design system overhaul for Acme." },
    });
    fireEvent.change(screen.getByLabelText(/tech stack/i), {
      target: { value: "Figma, Framer, React" },
    });

    fireEvent.click(screen.getByRole("button", { name: /add project/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/portfolios/pf-123/projects");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      sourceType: "manual",
      name: "Acme Redesign",
      description: "A design system overhaul for Acme.",
      techStack: ["Figma", "Framer", "React"],
    });

    await waitFor(() =>
      expect(screen.getByText(/project added!/i)).toBeInTheDocument()
    );
    expect(onAdded).toHaveBeenCalledTimes(1);
  });

  it("shows a client-side error when github URL is invalid", async () => {
    render(<RepoAddForm portfolioId="pf-1" />);
    const input = screen.getByPlaceholderText(/https:\/\/github\.com/i);
    fireEvent.change(input, { target: { value: "not a url" } });
    fireEvent.click(screen.getByRole("button", { name: /^validate$/i }));
    await waitFor(() =>
      expect(screen.getByText(/invalid format/i)).toBeInTheDocument()
    );
  });
});
