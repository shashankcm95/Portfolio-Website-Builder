/**
 * Unit tests for `listUserRepos()` — the GitHub client–backed helper that
 * powers the "Browse my repos" bulk-import picker.
 *
 * The real GitHubClient is mocked so we can assert:
 *   - it hits the correct URL with per_page=100 & sort=pushed&direction=desc
 *   - it returns the GitHub order unchanged (server is already sorted)
 *   - it normalizes snake_case → camelCase cleanly
 *   - it caps per_page to 100 regardless of caller input
 */

import { listUserRepos } from "@/lib/github/repo-fetcher";

function makeClient(payload: unknown) {
  const get = jest.fn().mockResolvedValue(payload);
  return { client: { get } as any, get };
}

const fixturePayload = [
  {
    name: "alpha",
    owner: { login: "octocat" },
    description: "alpha description",
    language: "TypeScript",
    stargazers_count: 12,
    forks_count: 3,
    updated_at: "2026-04-01T00:00:00Z",
    pushed_at: "2026-04-10T00:00:00Z",
    html_url: "https://github.com/octocat/alpha",
    fork: false,
    archived: false,
  },
  {
    name: "beta",
    owner: { login: "octocat" },
    description: null,
    language: null,
    stargazers_count: 0,
    forks_count: 0,
    updated_at: "2026-03-01T00:00:00Z",
    pushed_at: null,
    html_url: "https://github.com/octocat/beta",
    fork: true,
    archived: true,
  },
];

describe("listUserRepos", () => {
  it("calls GET /users/:login/repos with per_page=100, sort=pushed, direction=desc", async () => {
    const { client, get } = makeClient(fixturePayload);
    await listUserRepos(client, "octocat");
    expect(get).toHaveBeenCalledTimes(1);
    const path = get.mock.calls[0][0] as string;
    expect(path).toContain("/users/octocat/repos");
    expect(path).toContain("per_page=100");
    expect(path).toContain("sort=pushed");
    expect(path).toContain("direction=desc");
  });

  it("URL-encodes the login path segment", async () => {
    const { client, get } = makeClient([]);
    await listUserRepos(client, "foo bar");
    const path = get.mock.calls[0][0] as string;
    expect(path).toContain("/users/foo%20bar/repos");
  });

  it("caps per_page at 100 even when a larger value is requested", async () => {
    const { client, get } = makeClient([]);
    await listUserRepos(client, "octocat", { perPage: 500 });
    const path = get.mock.calls[0][0] as string;
    expect(path).toContain("per_page=100");
  });

  it("clamps per_page to at least 1 when a non-positive value is passed", async () => {
    const { client, get } = makeClient([]);
    await listUserRepos(client, "octocat", { perPage: 0 });
    const path = get.mock.calls[0][0] as string;
    expect(path).toContain("per_page=1");
  });

  it("returns the rows in the order the API returned them", async () => {
    const { client } = makeClient(fixturePayload);
    const out = await listUserRepos(client, "octocat");
    expect(out.map((r) => r.name)).toEqual(["alpha", "beta"]);
  });

  it("normalizes snake_case into the documented camelCase shape", async () => {
    const { client } = makeClient(fixturePayload);
    const out = await listUserRepos(client, "octocat");
    expect(out[0]).toEqual({
      owner: "octocat",
      name: "alpha",
      fullName: "octocat/alpha",
      description: "alpha description",
      language: "TypeScript",
      stars: 12,
      forks: 3,
      updatedAt: "2026-04-10T00:00:00Z", // pushed_at wins
      htmlUrl: "https://github.com/octocat/alpha",
      isFork: false,
      isArchived: false,
    });
  });

  it("falls back to updated_at when pushed_at is null", async () => {
    const { client } = makeClient(fixturePayload);
    const out = await listUserRepos(client, "octocat");
    expect(out[1].updatedAt).toBe("2026-03-01T00:00:00Z");
    expect(out[1].isFork).toBe(true);
    expect(out[1].isArchived).toBe(true);
  });

  it("falls back to the login when owner is missing from the payload", async () => {
    const { client } = makeClient([
      {
        name: "orphan",
        owner: null,
        description: null,
        language: null,
        stargazers_count: 0,
        forks_count: 0,
        updated_at: "2026-01-01T00:00:00Z",
        pushed_at: "2026-01-01T00:00:00Z",
        html_url: "https://github.com/octocat/orphan",
        fork: false,
        archived: false,
      },
    ]);
    const out = await listUserRepos(client, "octocat");
    expect(out[0].owner).toBe("octocat");
    expect(out[0].fullName).toBe("octocat/orphan");
  });

  it("returns an empty array when the user has no repos", async () => {
    const { client } = makeClient([]);
    const out = await listUserRepos(client, "nobody");
    expect(out).toEqual([]);
  });

  it("propagates client errors (e.g. 404 for unknown user) unchanged", async () => {
    const err = new Error(
      "GitHub API error 404 (Not Found) for https://api.github.com/users/ghost/repos"
    );
    const client = { get: jest.fn().mockRejectedValue(err) } as any;
    await expect(listUserRepos(client, "ghost")).rejects.toThrow(/404/);
  });
});
