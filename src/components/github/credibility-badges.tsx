"use client";

import {
  CheckCircle2,
  XCircle,
  GitCommit,
  Users,
  Tag,
  FlaskConical,
  Workflow,
  AlertCircle,
  Calendar,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  CredibilitySignals,
  StoredCredibilitySignals,
} from "@/lib/credibility/types";

interface CredibilityBadgesProps {
  // Accept reader type so v1 rows (pre-Phase-2) render fine. Phase 1 fields
  // (ci, recency, commits, etc.) are required on both shapes, which is all
  // this component reads.
  signals: CredibilitySignals | StoredCredibilitySignals | null;
  /**
   * Compact = card layout. Renders a tight row of the top 5-6 signals.
   * Default = detail-page layout. Renders every signal with richer detail
   * (language breakdown bar, release timeline, full topic list).
   */
  compact?: boolean;
  className?: string;
}

/**
 * Render the credibility-signals bundle as a row (compact) or grid (full).
 *
 * Conventions:
 * - `status: "ok"`  → normal badge
 * - `status: "missing"` → muted badge ("No CI", "No topics")
 * - `status: "error"` → nothing rendered (prevents flapping on transient
 *   GitHub hiccups from scaring the user)
 */
export function CredibilityBadges({
  signals,
  compact = false,
  className,
}: CredibilityBadgesProps) {
  if (!signals) {
    return null;
  }

  return compact ? (
    <CompactRow signals={signals} className={className} />
  ) : (
    <FullLayout signals={signals} className={className} />
  );
}

// ─── Compact row (card) ─────────────────────────────────────────────────────

function CompactRow({
  signals,
  className,
}: {
  signals: CredibilitySignals | StoredCredibilitySignals;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 text-xs",
        className
      )}
      data-testid="credibility-badges-compact"
    >
      <CiBadge signals={signals} />
      <TopLanguagesBadge signals={signals} />
      <CommitsBadge signals={signals} />
      <TestFrameworkBadge signals={signals} />
      <TopTopicsBadge signals={signals} />
    </div>
  );
}

// ─── Full layout (detail page) ──────────────────────────────────────────────

function FullLayout({
  signals,
  className,
}: {
  signals: CredibilitySignals | StoredCredibilitySignals;
  className?: string;
}) {
  return (
    <div
      className={cn("space-y-4", className)}
      data-testid="credibility-badges-full"
    >
      {/* Row 1 — "Is this real and maintained?" */}
      <Section heading="Real and maintained">
        <div className="flex flex-wrap items-center gap-2">
          <CiBadge signals={signals} />
          <RecencyBadge signals={signals} />
          <ReleasesBadge signals={signals} />
        </div>
      </Section>

      {/* Row 2 — "What does it do and how?" */}
      <Section heading="What it is">
        <div className="space-y-3">
          <LanguageBreakdownBar signals={signals} />
          <div className="flex flex-wrap items-center gap-2">
            <WorkflowsBadge signals={signals} />
          </div>
          <TopicsChips signals={signals} />
        </div>
      </Section>

      {/* Row 3 — "Does the developer work like a pro?" */}
      <Section heading="Development signal">
        <div className="flex flex-wrap items-center gap-2">
          <CommitsBadge signals={signals} />
          <ContributorsBadge signals={signals} />
          <IssuesAndPRsBadge signals={signals} />
        </div>
      </Section>

      {/* Row 4 — "What they use" */}
      <Section heading="Stack">
        <div className="space-y-2">
          <TestFrameworkBadge signals={signals} />
          <VerifiedStackChips signals={signals} />
        </div>
      </Section>
    </div>
  );
}

function Section({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {heading}
      </h4>
      {children}
    </div>
  );
}

// ─── Individual badges ──────────────────────────────────────────────────────

function CiBadge({ signals }: { signals: CredibilitySignals | StoredCredibilitySignals }) {
  const ci = signals.ci;
  if (ci.status === "error") return null;
  if (ci.status === "missing") {
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <AlertCircle className="h-3 w-3" />
        No CI
      </Badge>
    );
  }
  const passing = ci.conclusion === "success";
  return (
    <a
      href={ci.runUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="no-underline"
      title={`Last run ${new Date(ci.runAt).toLocaleString()}`}
    >
      <Badge
        variant="outline"
        className={cn(
          "gap-1",
          passing
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
        )}
      >
        {passing ? (
          <CheckCircle2 className="h-3 w-3" />
        ) : (
          <XCircle className="h-3 w-3" />
        )}
        CI {passing ? "passing" : "failing"}
      </Badge>
    </a>
  );
}

function TopLanguagesBadge({ signals }: { signals: CredibilitySignals | StoredCredibilitySignals }) {
  if (signals.languages.status !== "ok") return null;
  const top = signals.languages.breakdown.slice(0, 2);
  if (top.length === 0) return null;
  return (
    <Badge variant="secondary" className="gap-1">
      {top.map((l) => `${l.name} ${l.pct}%`).join(" · ")}
    </Badge>
  );
}

function CommitsBadge({ signals }: { signals: CredibilitySignals | StoredCredibilitySignals }) {
  if (signals.commits.status !== "ok") return null;
  const { total, firstAt, lastAt } = signals.commits;
  const firstYear = new Date(firstAt).getFullYear();
  const lastYear = new Date(lastAt).getFullYear();
  const span =
    firstYear === lastYear ? `${firstYear}` : `${firstYear}–${lastYear}`;
  return (
    <Badge variant="secondary" className="gap-1">
      <GitCommit className="h-3 w-3" />
      {total.toLocaleString()} commits · {span}
    </Badge>
  );
}

function ContributorsBadge({ signals }: { signals: CredibilitySignals | StoredCredibilitySignals }) {
  if (signals.contributors.status !== "ok") return null;
  const { count } = signals.contributors;
  return (
    <Badge variant="secondary" className="gap-1">
      <Users className="h-3 w-3" />
      {count} contributor{count === 1 ? "" : "s"}
    </Badge>
  );
}

function IssuesAndPRsBadge({ signals }: { signals: CredibilitySignals | StoredCredibilitySignals }) {
  if (signals.issuesAndPRs.status !== "ok") return null;
  return (
    <Badge variant="secondary" className="gap-1">
      {signals.issuesAndPRs.closedTotal.toLocaleString()} issues / PRs resolved
    </Badge>
  );
}

function RecencyBadge({ signals }: { signals: CredibilitySignals | StoredCredibilitySignals }) {
  if (signals.recency.status !== "ok") return null;
  const { createdAt, lastPushedAt } = signals.recency;
  const age = yearsSince(createdAt);
  const pushedAgo = daysSince(lastPushedAt);
  return (
    <Badge variant="secondary" className="gap-1">
      <Calendar className="h-3 w-3" />
      {age}yr old · last push {pushedAgo}d ago
    </Badge>
  );
}

function ReleasesBadge({ signals }: { signals: CredibilitySignals | StoredCredibilitySignals }) {
  const r = signals.releases;
  if (r.status === "error") return null;
  if (r.status === "missing") {
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        No releases
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <Tag className="h-3 w-3" />
      {r.count} release{r.count === 1 ? "" : "s"}
      {r.latestTag ? ` · ${r.latestTag}` : ""}
    </Badge>
  );
}

function WorkflowsBadge({ signals }: { signals: CredibilitySignals | StoredCredibilitySignals }) {
  const wf = signals.workflows;
  if (wf.status === "error") return null;
  if (wf.status === "missing") {
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <Workflow className="h-3 w-3" />
        No workflows
      </Badge>
    );
  }
  const active = Object.entries(wf.categories).filter(([, n]) => n > 0);
  const label = active.map(([cat, n]) => `${cat}${n > 1 ? ` (${n})` : ""}`).join(" · ");
  return (
    <Badge variant="secondary" className="gap-1">
      <Workflow className="h-3 w-3" />
      {wf.total} workflow{wf.total === 1 ? "" : "s"}
      {label ? ` · ${label}` : ""}
    </Badge>
  );
}

function TestFrameworkBadge({ signals }: { signals: CredibilitySignals | StoredCredibilitySignals }) {
  if (signals.testFramework.status !== "ok") return null;
  const name = signals.testFramework.name;
  const pretty: Record<typeof name, string> = {
    jest: "Jest",
    vitest: "Vitest",
    pytest: "pytest",
    "cargo-test": "cargo test",
    "go-test": "go test",
    mocha: "Mocha",
  };
  return (
    <Badge variant="secondary" className="gap-1">
      <FlaskConical className="h-3 w-3" />
      Tested with {pretty[name]}
    </Badge>
  );
}

function TopTopicsBadge({ signals }: { signals: CredibilitySignals | StoredCredibilitySignals }) {
  if (signals.topics.status !== "ok") return null;
  const top = signals.topics.items.slice(0, 2);
  if (top.length === 0) return null;
  return (
    <>
      {top.map((t) => (
        <Badge key={t} variant="outline" className="text-xs">
          {t}
        </Badge>
      ))}
    </>
  );
}

function TopicsChips({ signals }: { signals: CredibilitySignals | StoredCredibilitySignals }) {
  if (signals.topics.status !== "ok" || signals.topics.items.length === 0)
    return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {signals.topics.items.map((t) => (
        <Badge key={t} variant="outline" className="text-xs">
          {t}
        </Badge>
      ))}
    </div>
  );
}

function VerifiedStackChips({ signals }: { signals: CredibilitySignals | StoredCredibilitySignals }) {
  if (
    signals.verifiedStack.status !== "ok" ||
    signals.verifiedStack.items.length === 0
  )
    return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {signals.verifiedStack.items.map((t) => (
        <Badge
          key={t}
          variant="outline"
          className="text-xs"
          title="Detected from repo dependencies"
        >
          {t}
        </Badge>
      ))}
    </div>
  );
}

// ─── Language bar chart (full layout only) ──────────────────────────────────

function LanguageBreakdownBar({ signals }: { signals: CredibilitySignals | StoredCredibilitySignals }) {
  if (signals.languages.status !== "ok") return null;
  const breakdown = signals.languages.breakdown;
  if (breakdown.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {breakdown.map((lang, i) => (
          <div
            key={lang.name}
            className={COLOR_CLASSES[i % COLOR_CLASSES.length]}
            style={{ width: `${lang.pct}%` }}
            title={`${lang.name}: ${lang.pct}%`}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {breakdown.map((lang, i) => (
          <span key={lang.name} className="flex items-center gap-1.5">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                COLOR_CLASSES[i % COLOR_CLASSES.length]
              )}
            />
            {lang.name} {lang.pct}%
          </span>
        ))}
      </div>
    </div>
  );
}

const COLOR_CLASSES = [
  "bg-blue-500",
  "bg-yellow-400",
  "bg-green-500",
  "bg-orange-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-cyan-500",
  "bg-red-500",
];

// ─── Date helpers (local, small) ────────────────────────────────────────────

function daysSince(iso: string): number {
  return Math.max(
    0,
    Math.round((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24))
  );
}

function yearsSince(iso: string): number {
  return Math.max(
    0,
    Math.floor(daysSince(iso) / 365)
  );
}
