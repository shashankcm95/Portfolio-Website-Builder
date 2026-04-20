import { GitHubRateLimiter } from "@/lib/github/rate-limiter";

const GITHUB_API_BASE = "https://api.github.com";
const USER_AGENT = "portfolio-website-builder/0.1.0";

/**
 * Lightweight GitHub REST API client built on the native `fetch` API.
 *
 * Supports both authenticated (OAuth token) and unauthenticated usage.
 * Tracks rate-limit headers automatically via {@link GitHubRateLimiter}.
 */
export class GitHubClient {
  private token: string | undefined;
  private rateLimiter: GitHubRateLimiter;

  constructor(token?: string) {
    this.token = token;
    this.rateLimiter = new GitHubRateLimiter();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * `GET` a JSON resource from the GitHub REST API.
   *
   * @param path - API path **without** the base URL, e.g. `/repos/owner/repo`.
   */
  async get<T>(path: string): Promise<T> {
    await this.rateLimiter.waitIfNeeded();

    const url = `${GITHUB_API_BASE}${path}`;
    const response = await fetch(url, {
      method: "GET",
      headers: this.buildHeaders(),
    });

    this.rateLimiter.update(response.headers);

    if (!response.ok) {
      await this.throwHttpError(response, url);
    }

    return (await response.json()) as T;
  }

  /**
   * Like {@link get}, but also exposes the response headers.
   *
   * Needed for endpoints where the *count* of items is derived from the
   * `Link` header's `rel="last"` page number (e.g. commit/contributor counts
   * via `?per_page=1`). See {@link parseLinkHeaderLast}.
   */
  async getWithHeaders<T>(
    path: string
  ): Promise<{ data: T; headers: Headers }> {
    await this.rateLimiter.waitIfNeeded();

    const url = `${GITHUB_API_BASE}${path}`;
    const response = await fetch(url, {
      method: "GET",
      headers: this.buildHeaders(),
    });

    this.rateLimiter.update(response.headers);

    if (!response.ok) {
      await this.throwHttpError(response, url);
    }

    const data = (await response.json()) as T;
    return { data, headers: response.headers };
  }

  /**
   * Fetch the **text** body of an arbitrary URL (e.g. raw file content on
   * `raw.githubusercontent.com`).  No `Accept: application/vnd.github.v3+json`
   * header is sent for these requests.
   */
  async getText(url: string): Promise<string> {
    await this.rateLimiter.waitIfNeeded();

    const headers: Record<string, string> = {
      "User-Agent": USER_AGENT,
    };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      method: "GET",
      headers,
    });

    // Only update the rate-limiter when the response comes from GitHub.
    if (
      url.includes("github.com") ||
      url.includes("githubusercontent.com")
    ) {
      this.rateLimiter.update(response.headers);
    }

    if (!response.ok) {
      await this.throwHttpError(response, url);
    }

    return response.text();
  }

  /**
   * Returns the most recently observed `x-ratelimit-remaining` value.
   */
  getRateLimitRemaining(): number {
    return this.rateLimiter.getRemaining();
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": USER_AGENT,
    };

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    return headers;
  }

  /**
   * Reads the response body and throws a descriptive error including the HTTP
   * status, the URL, and any message returned by the API.
   */
  private async throwHttpError(
    response: Response,
    url: string,
  ): Promise<never> {
    let detail = "";
    try {
      const body = await response.text();
      const parsed = JSON.parse(body) as { message?: string };
      if (parsed.message) {
        detail = ` - ${parsed.message}`;
      }
    } catch {
      // Body was not JSON or was empty -- ignore.
    }

    throw new Error(
      `GitHub API error ${response.status} (${response.statusText}) for ${url}${detail}`,
    );
  }
}
