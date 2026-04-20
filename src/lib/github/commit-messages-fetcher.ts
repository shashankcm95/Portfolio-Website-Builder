import type { GitHubClient } from "@/lib/github/client";
import type { CommitMessagesSignal } from "@/lib/credibility/types";
import { classifyCommitMessage } from "@/lib/credibility/authorship";

interface CommitEntry {
  commit: {
    message: string;
    author?: { date?: string };
    committer?: { date?: string };
  };
}

/**
 * Fetch the most recent N commits and score each message for "meaning."
 *
 * We score the *first line* of each commit (before `\n`) — Conventional
 * Commits and most traditions keep the summary there; body text is
 * irrelevant to the signal. `meaningfulCount` is the number of messages
 * passing {@link classifyCommitMessage}.
 *
 * Returns a small `sample` (first 5 raw messages) for UI debug / display,
 * not for reasoning — the `meaningfulCount / total` ratio is what the
 * authorship scorer consumes.
 */
export async function fetchRecentCommitMessages(
  client: GitHubClient,
  owner: string,
  repo: string,
  limit = 30
): Promise<CommitMessagesSignal> {
  try {
    const data = await client.get<CommitEntry[]>(
      `/repos/${owner}/${repo}/commits?per_page=${limit}`
    );
    if (!Array.isArray(data) || data.length === 0) {
      return { status: "ok", total: 0, meaningfulCount: 0, sample: [] };
    }

    const firstLines = data.map((c) =>
      firstLineOf(c.commit?.message ?? "")
    );
    const meaningfulCount = firstLines.filter((m) =>
      classifyCommitMessage(m)
    ).length;

    return {
      status: "ok",
      total: firstLines.length,
      meaningfulCount,
      sample: firstLines.slice(0, 5),
    };
  } catch {
    return { status: "error" };
  }
}

function firstLineOf(message: string): string {
  const idx = message.indexOf("\n");
  return idx === -1 ? message : message.slice(0, idx);
}
