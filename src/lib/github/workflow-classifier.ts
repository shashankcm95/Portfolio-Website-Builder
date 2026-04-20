import type { WorkflowCategory } from "@/lib/credibility/types";

/**
 * Classify a GitHub Actions workflow into one of six buckets by inspecting
 * its filename and (optionally) display name.
 *
 * The mapping is pragmatic, not exhaustive — we want recruiter-meaningful
 * signal ("this repo has *test* AND *deploy* workflows") without chasing
 * every idiosyncratic workflow title. Unrecognized names fall through to
 * "other" rather than guessing.
 *
 * Ordering matters: more specific patterns are checked first.
 */
export function classifyWorkflow(
  name: string | null | undefined,
  path: string | null | undefined
): WorkflowCategory {
  const haystack = `${name ?? ""} ${path ?? ""}`.toLowerCase();

  // Security first — it shares words with "test" (security-test) but
  // recruiters care about the security intent.
  if (
    /\b(security|codeql|snyk|dependabot|semgrep|trivy|trufflehog)\b/.test(
      haystack
    )
  ) {
    return "security";
  }

  // Release / publish
  if (
    /\b(release|publish|changelog|semantic-release|changesets?)\b/.test(
      haystack
    )
  ) {
    return "release";
  }

  // Deploy — includes CI/CD chains that do deploy
  if (
    /\b(deploy|deployment|cd\b|pages|netlify|vercel|cloudflare|render|fly\.io|heroku|aws)\b/.test(
      haystack
    )
  ) {
    return "deploy";
  }

  // Lint / format / type-check
  if (
    /\b(lint|eslint|prettier|format|formatter|typecheck|type-check|tsc|rubocop|flake8|black|stylelint)\b/.test(
      haystack
    )
  ) {
    return "lint";
  }

  // Test — widest bucket; covers CI, test, coverage, e2e
  if (
    /\b(test|tests|testing|ci\b|unit|integration|e2e|playwright|cypress|pytest|jest|vitest|coverage|codecov)\b/.test(
      haystack
    )
  ) {
    return "test";
  }

  return "other";
}
