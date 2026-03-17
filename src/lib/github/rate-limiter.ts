/**
 * GitHub API rate limit tracker.
 *
 * Reads the `x-ratelimit-remaining` and `x-ratelimit-reset` response headers
 * and exposes helpers so callers can avoid hitting 403 rate-limit errors.
 *
 * Unauthenticated requests default to 60 requests/hour; authenticated to 5 000.
 */
export class GitHubRateLimiter {
  private remaining: number = 60;
  private resetAt: number = 0;

  /**
   * Call after every GitHub API response to keep the counters up to date.
   */
  update(headers: Headers): void {
    const remaining = headers.get("x-ratelimit-remaining");
    const reset = headers.get("x-ratelimit-reset");

    if (remaining !== null) {
      this.remaining = parseInt(remaining, 10);
    }
    if (reset !== null) {
      // The header value is a Unix epoch in **seconds**; we store milliseconds.
      this.resetAt = parseInt(reset, 10) * 1000;
    }
  }

  /**
   * Returns `true` when it is safe to fire another request, i.e. either
   * remaining quota is positive or the reset window has already elapsed.
   */
  canMakeRequest(): boolean {
    if (this.remaining > 0) return true;
    return Date.now() > this.resetAt;
  }

  /**
   * Awaits until the rate-limit window resets (capped at 60 s to avoid
   * indefinitely blocking the caller).  If there is remaining quota the
   * promise resolves immediately.
   */
  async waitIfNeeded(): Promise<void> {
    if (!this.canMakeRequest()) {
      const waitMs = this.resetAt - Date.now();
      if (waitMs > 0) {
        await new Promise<void>((resolve) =>
          setTimeout(resolve, Math.min(waitMs, 60_000)),
        );
      }
    }
  }

  /**
   * Returns the most recently observed remaining request count.
   */
  getRemaining(): number {
    return this.remaining;
  }
}
