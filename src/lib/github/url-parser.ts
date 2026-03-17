/**
 * Parse and validate GitHub repository URLs.
 *
 * Supported formats:
 * - `https://github.com/owner/repo`
 * - `https://github.com/owner/repo.git`
 * - `https://github.com/owner/repo/tree/main`
 * - `https://github.com/owner/repo/tree/main/path/to/dir`
 * - `github.com/owner/repo`
 * - `http://github.com/owner/repo`
 * - `https://www.github.com/owner/repo`
 */

export interface ParsedGitHubUrl {
  owner: string;
  repo: string;
}

/**
 * Extracts the `owner` and `repo` from a GitHub URL.
 * Returns `null` when the input is not a recognisable GitHub repo URL.
 */
export function parseGitHubUrl(url: string): ParsedGitHubUrl | null {
  const match = url.match(
    /(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/.\s]+)/,
  );

  if (!match) return null;

  return { owner: match[1], repo: match[2] };
}

/**
 * Convenience predicate -- returns `true` when the string looks like a valid
 * GitHub repository URL.
 */
export function isValidGitHubRepoUrl(url: string): boolean {
  return parseGitHubUrl(url) !== null;
}
