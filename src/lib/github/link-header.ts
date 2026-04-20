/**
 * Parse GitHub's RFC 5988 `Link` header to extract pagination info.
 *
 * GitHub uses `Link` to paginate list endpoints. When a request has
 * `?per_page=1`, the `rel="last"` URL's `page` param equals the total
 * count of items — an otherwise-cheap way to get counts without fetching
 * every page.
 *
 * Example input:
 *   <https://api.github.com/repos/x/y/commits?per_page=1&page=2>; rel="next",
 *   <https://api.github.com/repos/x/y/commits?per_page=1&page=247>; rel="last"
 *
 * Returns 247 for that input, or `null` if no `rel="last"` URL is present
 * (single-page result — caller infers count from response body length).
 */
export function parseLinkHeaderLast(header: string | null): number | null {
  if (!header) return null;

  // Each link entry: `<url>; rel="name"` separated by commas.
  const entries = header.split(",").map((s) => s.trim());

  for (const entry of entries) {
    const match = entry.match(/^<([^>]+)>;\s*rel="last"$/);
    if (!match) continue;

    const url = match[1];
    const pageMatch = url.match(/[?&]page=(\d+)/);
    if (!pageMatch) return null;

    const page = Number(pageMatch[1]);
    return Number.isFinite(page) ? page : null;
  }

  return null;
}
