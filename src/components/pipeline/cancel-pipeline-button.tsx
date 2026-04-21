"use client";

/**
 * Phase 10, Track D — Cancel button for a running pipeline.
 *
 * Posts to `/api/portfolios/:portfolioId/projects/:projectId/pipeline/cancel`,
 * handles its own loading state, and fires the supplied `onCancelled`
 * callback on success so the parent can refresh status.
 */

import { useCallback, useState } from "react";
import { Loader2, XOctagon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CancelPipelineButtonProps {
  portfolioId: string;
  projectId: string;
  onCancelled?: () => void;
}

export function CancelPipelineButton({
  portfolioId,
  projectId,
  onCancelled,
}: CancelPipelineButtonProps) {
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = useCallback(async () => {
    setIsCancelling(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/portfolios/${portfolioId}/projects/${projectId}/pipeline/cancel`,
        { method: "POST" }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed to cancel (${res.status})`);
      }

      onCancelled?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel");
    } finally {
      setIsCancelling(false);
    }
  }, [portfolioId, projectId, onCancelled]);

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={isCancelling}
        aria-label="Cancel running pipeline"
      >
        {isCancelling ? (
          <>
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            Cancelling...
          </>
        ) : (
          <>
            <XOctagon className="mr-1.5 h-3.5 w-3.5" />
            Cancel
          </>
        )}
      </Button>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
