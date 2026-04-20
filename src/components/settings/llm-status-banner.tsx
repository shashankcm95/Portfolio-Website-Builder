"use client";

import { useEffect, useState } from "react";
import { LlmNotConfiguredBanner } from "@/components/settings/llm-not-configured-banner";

/**
 * Client wrapper around `<LlmNotConfiguredBanner />` that fetches the
 * current LLM configuration status from `GET /api/settings/llm` on mount.
 * Renders nothing while loading (no flash-of-banner), then shows the
 * banner only when both BYOK and platform env are absent.
 */
export function LlmStatusBanner() {
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings/llm");
        if (!res.ok) {
          if (!cancelled) setConfigured(true); // assume OK on error — don't nag
          return;
        }
        const data = (await res.json()) as { configured?: boolean };
        if (!cancelled) setConfigured(data.configured ?? false);
      } catch {
        if (!cancelled) setConfigured(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (configured === null) return null;
  return <LlmNotConfiguredBanner show={!configured} />;
}
