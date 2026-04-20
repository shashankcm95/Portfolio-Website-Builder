import {
  isValidGitHubRepoUrl,
  parseGitHubUrl,
} from "@/lib/github/url-parser";

describe("parseGitHubUrl", () => {
  it.each([
    ["https://github.com/owner/repo", { owner: "owner", repo: "repo" }],
    [
      "https://github.com/Anthropic/claude-agent-sdk",
      { owner: "Anthropic", repo: "claude-agent-sdk" },
    ],
    [
      "https://www.github.com/owner/repo",
      { owner: "owner", repo: "repo" },
    ],
    [
      "http://github.com/owner/repo",
      { owner: "owner", repo: "repo" },
    ],
    [
      "github.com/owner/repo",
      { owner: "owner", repo: "repo" },
    ],
    [
      "https://github.com/owner/repo/tree/main",
      { owner: "owner", repo: "repo" },
    ],
    [
      "https://github.com/owner/repo/tree/main/packages/core",
      { owner: "owner", repo: "repo" },
    ],
  ])("parses %s", (input, expected) => {
    expect(parseGitHubUrl(input)).toEqual(expected);
  });

  it("returns null for non-GitHub urls", () => {
    expect(parseGitHubUrl("https://gitlab.com/owner/repo")).toBeNull();
  });

  it("returns null for bare text", () => {
    expect(parseGitHubUrl("owner/repo")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseGitHubUrl("")).toBeNull();
  });
});

describe("isValidGitHubRepoUrl", () => {
  it("returns true for valid URLs", () => {
    expect(isValidGitHubRepoUrl("https://github.com/x/y")).toBe(true);
  });
  it("returns false otherwise", () => {
    expect(isValidGitHubRepoUrl("not a url")).toBe(false);
  });
});
