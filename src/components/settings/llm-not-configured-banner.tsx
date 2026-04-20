import Link from "next/link";
import { AlertCircle, ArrowRight } from "lucide-react";

/**
 * Dashboard-wide sticky banner shown when the signed-in user has no BYOK
 * AND no platform env key is available. Points them at Settings → AI
 * Provider. The `hasLlmConfigForUser` factory helper is the source of
 * truth; callers pass the result in so this component stays pure.
 */
export function LlmNotConfiguredBanner({
  show,
}: {
  show: boolean;
}) {
  if (!show) return null;
  return (
    <div
      className="flex flex-col items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between"
      data-testid="llm-not-configured-banner"
      role="status"
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          AI features are disabled — no LLM provider is configured. Set one
          up to generate narratives, storyboards, and verified claims.
        </p>
      </div>
      <Link
        href="/settings#ai-provider"
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/20 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-amber-500/30"
      >
        Go to Settings
        <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
