"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Briefcase,
  CheckCircle2,
  FolderGit2,
  Rocket,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatRelativeTime, type ActivityEvent } from "@/lib/activity";

const ICONS = {
  portfolio_created: Briefcase,
  project_added: FolderGit2,
  project_analyzed: Sparkles,
  deployment_live: Rocket,
  deployment_failed: XCircle,
} as const;

const TONE = {
  portfolio_created: "text-blue-600 dark:text-blue-400",
  project_added: "text-slate-600 dark:text-slate-400",
  project_analyzed: "text-purple-600 dark:text-purple-400",
  deployment_live: "text-green-600 dark:text-green-400",
  deployment_failed: "text-red-600 dark:text-red-400",
} as const;

interface ActivityFeedProps {
  limit?: number;
}

/**
 * Client-rendered recent-activity feed. Loads lazily to keep the server-rendered
 * dashboard snappy; falls back to an empty state for brand-new users.
 */
export function ActivityFeed({ limit = 10 }: ActivityFeedProps) {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/activity?limit=${limit}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { events: ActivityEvent[] };
        if (!cancelled) setEvents(data.events);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
          setEvents([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [limit]);

  if (events === null) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Loading activity...
        </CardContent>
      </Card>
    );
  }

  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <p className="text-muted-foreground">
            {error ? "Couldn't load activity" : "No recent activity"}
          </p>
          <p className="text-sm text-muted-foreground">
            {error
              ? "Please refresh and try again."
              : "Create a portfolio to get started."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <ul className="divide-y">
          {events.map((event) => {
            const Icon =
              ICONS[event.type as keyof typeof ICONS] ?? CheckCircle2;
            const toneClass =
              TONE[event.type as keyof typeof TONE] ?? "text-muted-foreground";
            const body = (
              <div className="flex items-start gap-3 px-4 py-3">
                <span
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted ${toneClass}`}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-tight">
                    {event.title}
                  </p>
                  {event.description && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {event.description}
                    </p>
                  )}
                </div>
                <time
                  className="shrink-0 text-xs text-muted-foreground"
                  dateTime={event.occurredAt}
                  title={new Date(event.occurredAt).toLocaleString()}
                >
                  {formatRelativeTime(event.occurredAt)}
                </time>
              </div>
            );
            return (
              <li key={event.id}>
                {event.href ? (
                  <Link
                    href={event.href}
                    className="block hover:bg-muted/40 transition-colors"
                  >
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
