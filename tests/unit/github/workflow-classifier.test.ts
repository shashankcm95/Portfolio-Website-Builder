import { classifyWorkflow } from "@/lib/github/workflow-classifier";

describe("classifyWorkflow", () => {
  // Table-driven test — each case is a real workflow name or path observed
  // in popular open-source projects. Labels were assigned by hand.
  const cases: Array<[string, string, ReturnType<typeof classifyWorkflow>]> = [
    // test bucket
    ["CI", ".github/workflows/ci.yml", "test"],
    ["Tests", ".github/workflows/tests.yml", "test"],
    ["Unit Tests", ".github/workflows/unit.yml", "test"],
    ["Integration Tests", ".github/workflows/integration.yml", "test"],
    ["E2E", ".github/workflows/e2e.yml", "test"],
    ["Playwright", ".github/workflows/playwright.yml", "test"],
    ["Cypress", ".github/workflows/cypress.yml", "test"],
    ["Jest", ".github/workflows/jest.yml", "test"],
    ["pytest", ".github/workflows/pytest.yml", "test"],
    ["Coverage", ".github/workflows/coverage.yml", "test"],
    ["Codecov", ".github/workflows/codecov.yml", "test"],

    // deploy bucket
    ["Deploy to production", ".github/workflows/deploy.yml", "deploy"],
    ["CD", ".github/workflows/cd.yml", "deploy"],
    ["Deploy Pages", ".github/workflows/pages.yml", "deploy"],
    ["Netlify", ".github/workflows/netlify.yml", "deploy"],
    ["Vercel Preview", ".github/workflows/vercel.yml", "deploy"],
    ["Cloudflare Deploy", ".github/workflows/cloudflare.yml", "deploy"],

    // lint bucket
    ["Lint", ".github/workflows/lint.yml", "lint"],
    ["ESLint", ".github/workflows/eslint.yml", "lint"],
    ["Prettier", ".github/workflows/prettier.yml", "lint"],
    ["Format", ".github/workflows/format.yml", "lint"],
    ["Type check", ".github/workflows/typecheck.yml", "lint"],
    ["Rubocop", ".github/workflows/rubocop.yml", "lint"],

    // security bucket
    ["CodeQL", ".github/workflows/codeql.yml", "security"],
    ["Snyk", ".github/workflows/snyk.yml", "security"],
    ["Dependabot Auto-merge", ".github/workflows/dependabot.yml", "security"],
    ["Semgrep", ".github/workflows/semgrep.yml", "security"],

    // release bucket
    ["Release", ".github/workflows/release.yml", "release"],
    ["Publish Package", ".github/workflows/publish.yml", "release"],
    ["Changelog", ".github/workflows/changelog.yml", "release"],
    ["Semantic Release", ".github/workflows/semantic-release.yml", "release"],

    // other bucket — things we don't try to classify
    ["Label issues", ".github/workflows/labeler.yml", "other"],
    ["Stale", ".github/workflows/stale.yml", "other"],
    ["Sync docs", ".github/workflows/docs-sync.yml", "other"],
  ];

  it.each(cases)(
    "classifies %s (%s) → %s",
    (name, path, expected) => {
      expect(classifyWorkflow(name, path)).toBe(expected);
    }
  );

  it("falls back to 'other' for null name and path", () => {
    expect(classifyWorkflow(null, null)).toBe("other");
    expect(classifyWorkflow(undefined, undefined)).toBe("other");
  });

  it("classifies security over test when both patterns match", () => {
    // "security-test.yml" should land in security, not test
    expect(classifyWorkflow("Security Test", "security-test.yml")).toBe(
      "security"
    );
  });
});
