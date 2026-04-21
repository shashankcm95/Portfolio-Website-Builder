"use client";

import { CheckCircle2, AlertTriangle, HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { VerifiedClaim, VerifierSpec } from "@/lib/ai/schemas/storyboard";

interface ClaimChipProps {
  claim: VerifiedClaim;
  className?: string;
}

/**
 * Renders one post-verification claim. Three visual states:
 *   - verified: green check + label. Popover shows the verifier spec + evidence.
 *   - flagged:  amber warning + label. Popover explains why (evidence = reason).
 *   - pending:  grey question. Fallback — shouldn't occur post-verify.
 */
export function ClaimChip({ claim, className }: ClaimChipProps) {
  const status = claim.status ?? "pending";
  const visual = visualFor(status);
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
              visual.classes,
              className
            )}
            data-testid="claim-chip"
            data-status={status}
            aria-label={`Claim: ${claim.label}. Status: ${status}.`}
          >
            <visual.Icon className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{claim.label}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs" sideOffset={6}>
          <div className="space-y-1 text-xs">
            <p className="font-semibold">{visual.label}</p>
            <p className="text-muted-foreground">
              {verifierDescription(claim.verifier)}
            </p>
            {claim.evidence && (
              <p
                className="mt-1 rounded bg-muted/50 px-1.5 py-0.5 font-mono"
                data-testid="claim-chip-evidence"
              >
                {claim.evidence}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function visualFor(status: "verified" | "flagged" | "pending") {
  switch (status) {
    case "verified":
      return {
        label: "Verified",
        Icon: CheckCircle2,
        classes:
          "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
      };
    case "flagged":
      return {
        label: "Not verified",
        Icon: AlertTriangle,
        classes:
          "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
      };
    case "pending":
      return {
        label: "Pending verification",
        Icon: HelpCircle,
        classes: "border-border bg-muted text-muted-foreground",
      };
  }
}

function verifierDescription(spec: VerifierSpec): string {
  switch (spec.kind) {
    case "dep":
      return `Checked for "${spec.package ?? "?"}"${spec.ecosystem ? ` in ${spec.ecosystem}` : ""} dependencies.`;
    case "file":
      return `Checked file tree for "${spec.glob ?? "?"}".`;
    case "workflow":
      return `Checked GitHub Actions for a "${spec.category ?? "?"}" workflow.`;
    case "grep":
      return `Checked ${(spec.sources ?? []).join(", ")} for pattern "${spec.pattern ?? "?"}".`;
  }
}
