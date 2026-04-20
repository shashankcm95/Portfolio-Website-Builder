"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ArchitectureDiagramProps {
  source: string;
  className?: string;
}

/**
 * Client-side mermaid renderer. Dynamically imports `mermaid` on mount so
 * the ~800 KB bundle stays out of every other route's chunk. On any parse
 * error, falls back to rendering the source in a fenced code block.
 *
 * The mermaid library is deliberately only loaded in the browser — `mermaid`
 * depends on DOM globals that aren't available during SSR.
 */
export function ArchitectureDiagram({
  source,
  className,
}: ArchitectureDiagramProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const mod = await import("mermaid");
        const mermaid = mod.default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "default",
          securityLevel: "strict",
        });
        // Each render needs a unique id to avoid duplicate-id collisions
        const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`;
        const { svg: rendered } = await mermaid.render(id, source);
        if (!cancelled) {
          setSvg(rendered);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Failed to render diagram"
          );
          setSvg(null);
        }
      }
    }
    render();
    return () => {
      cancelled = true;
    };
  }, [source]);

  if (error) {
    return (
      <div className={cn("space-y-2", className)} data-testid="architecture-diagram-fallback">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
          Diagram preview unavailable — showing source.
        </div>
        <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 font-mono text-xs">
          {source}
        </pre>
      </div>
    );
  }

  if (!svg) {
    // Loading — small skeleton
    return (
      <div
        className={cn(
          "flex h-32 items-center justify-center rounded-md border bg-muted/20 text-xs text-muted-foreground",
          className
        )}
        data-testid="architecture-diagram-loading"
      >
        Loading diagram…
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full justify-center overflow-x-auto rounded-md border bg-background p-3",
        className
      )}
      // mermaid returns a trusted SVG string; securityLevel:"strict" blocks
      // script execution in user-supplied labels, so dangerouslySetInnerHTML
      // is safe here.
      dangerouslySetInnerHTML={{ __html: svg }}
      data-testid="architecture-diagram"
    />
  );
}
