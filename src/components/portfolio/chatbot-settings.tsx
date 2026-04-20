"use client";

/**
 * Phase 5 + 5.2 — Owner-facing chatbot controls.
 *
 * Renders as a settings card below the main `<PortfolioSettings>`. Three
 * responsibilities:
 *
 *   1. Toggle `chatbotEnabled` on the portfolio (PATCH /api/portfolios/:id).
 *   2. Customize greeting + up to 3 starter questions (Phase 5.2).
 *   3. Show the 25 most-recent visitor transcripts.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  MessageCircle,
  RefreshCw,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  MAX_GREETING_CHARS,
  MAX_STARTER_CHARS,
  MAX_STARTERS,
} from "@/lib/chatbot/types";

interface ChatbotSettingsProps {
  portfolioId: string;
  chatbotEnabled: boolean;
  /** Initial greeting (null when unset). */
  chatbotGreeting?: string | null;
  /** Initial starters (up to MAX_STARTERS strings). */
  chatbotStarters?: string[];
  onEnabledChange?: (enabled: boolean) => void;
  onCustomizationChange?: (next: {
    greeting: string | null;
    starters: string[];
  }) => void;
}

interface SessionSummary {
  id: string;
  visitorId: string | null;
  updatedAt: string | null;
  createdAt: string | null;
  messageCount: number;
  preview: {
    lastVisitorMessage: string | null;
    lastAssistantReply: string | null;
  };
}

export function ChatbotSettings({
  portfolioId,
  chatbotEnabled: initialEnabled,
  chatbotGreeting: initialGreeting = null,
  chatbotStarters: initialStarters = [],
  onEnabledChange,
  onCustomizationChange,
}: ChatbotSettingsProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Phase 5.2 — customization state. Three starter slots are tracked
  // independently so the UI can keep one blank without collapsing.
  const paddedStarters = (() => {
    const s = [...(initialStarters ?? [])];
    while (s.length < MAX_STARTERS) s.push("");
    return s.slice(0, MAX_STARTERS);
  })();
  const [greeting, setGreeting] = useState<string>(initialGreeting ?? "");
  const [starters, setStarters] = useState<string[]>(paddedStarters);
  const [savingCustomization, setSavingCustomization] = useState(false);
  const [customizationError, setCustomizationError] = useState<string | null>(null);
  const [customizationSuccess, setCustomizationSuccess] = useState<string | null>(null);

  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Keep local state in sync when parent reports a change.
  useEffect(() => {
    setEnabled(initialEnabled);
  }, [initialEnabled]);

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const res = await fetch(
        `/api/portfolios/${portfolioId}/chatbot/sessions`
      );
      if (!res.ok) {
        setSessions([]);
        return;
      }
      const data = (await res.json()) as { sessions: SessionSummary[] };
      setSessions(data.sessions);
    } catch {
      setSessions([]);
    } finally {
      setLoadingSessions(false);
    }
  }, [portfolioId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const saveCustomization = useCallback(async () => {
    setSavingCustomization(true);
    setCustomizationError(null);
    setCustomizationSuccess(null);
    try {
      const nextGreeting = greeting.trim();
      const nextStarters = starters
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (nextGreeting.length > MAX_GREETING_CHARS) {
        setCustomizationError(
          `Greeting is ${nextGreeting.length} chars (max ${MAX_GREETING_CHARS}).`
        );
        return;
      }
      if (nextStarters.some((s) => s.length > MAX_STARTER_CHARS)) {
        setCustomizationError(
          `Each starter must be ≤ ${MAX_STARTER_CHARS} characters.`
        );
        return;
      }

      const res = await fetch(`/api/portfolios/${portfolioId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatbotGreeting: nextGreeting.length === 0 ? null : nextGreeting,
          chatbotStarters: nextStarters,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setCustomizationError(body.error ?? "Save failed");
        return;
      }
      setCustomizationSuccess(
        "Customization saved. Re-deploy to update your live site."
      );
      onCustomizationChange?.({
        greeting: nextGreeting.length === 0 ? null : nextGreeting,
        starters: nextStarters,
      });
    } catch {
      setCustomizationError("Network error");
    } finally {
      setSavingCustomization(false);
    }
  }, [greeting, starters, portfolioId, onCustomizationChange]);

  const updateStarter = useCallback((idx: number, value: string) => {
    setStarters((prev) => {
      const copy = [...prev];
      copy[idx] = value;
      return copy;
    });
  }, []);

  const toggleEnabled = useCallback(
    async (next: boolean) => {
      setEnabled(next); // optimistic
      setSaving(true);
      setError(null);
      setSuccess(null);
      try {
        const res = await fetch(`/api/portfolios/${portfolioId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatbotEnabled: next }),
        });
        if (!res.ok) {
          setEnabled(!next); // revert
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? "Update failed");
          return;
        }
        setSuccess(
          next
            ? "Chatbot enabled. It will appear on your next deploy."
            : "Chatbot disabled. It will be removed on your next deploy."
        );
        onEnabledChange?.(next);
      } catch {
        setEnabled(!next);
        setError("Network error");
      } finally {
        setSaving(false);
      }
    },
    [portfolioId, onEnabledChange]
  );

  return (
    <Card data-testid="chatbot-settings-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4" />
          Visitor chatbot
        </CardTitle>
        <CardDescription>
          When enabled, a floating chat widget appears on your published
          portfolio so visitors can ask grounded questions about your work.
          Answers are drawn only from your verified facts and narrative —
          never invented.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Toggle */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="chatbot-enabled" className="text-sm">
              Enable on published site
            </Label>
            <p className="text-xs text-muted-foreground">
              Re-deploy to push the change to your live URL.
            </p>
          </div>
          <Switch
            id="chatbot-enabled"
            checked={enabled}
            disabled={saving}
            onCheckedChange={toggleEnabled}
            data-testid="chatbot-enabled-toggle"
          />
        </div>

        {error && (
          <p
            role="alert"
            className="flex items-start gap-1.5 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
        {success && (
          <p
            role="status"
            className="flex items-start gap-1.5 text-sm text-emerald-700 dark:text-emerald-400"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            {success}
          </p>
        )}

        <Separator />

        {/* Phase 5.2 — Greeting + starters */}
        <div className="space-y-4" data-testid="chatbot-customization">
          <div>
            <h4 className="text-sm font-medium">Greeting &amp; starter questions</h4>
            <p className="text-xs text-muted-foreground">
              Optional. The greeting appears as the first message; starter
              questions render as clickable chips above the input.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="chatbot-greeting" className="text-xs">
              Greeting message
            </Label>
            <textarea
              id="chatbot-greeting"
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
              placeholder="Hi! Ask me anything about my recent projects."
              rows={3}
              maxLength={MAX_GREETING_CHARS}
              disabled={savingCustomization}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="chatbot-greeting-input"
            />
            <p className="text-right text-[10px] text-muted-foreground">
              {greeting.length} / {MAX_GREETING_CHARS}
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Starter questions (up to {MAX_STARTERS})</Label>
            {starters.map((s, i) => (
              <Input
                key={i}
                value={s}
                onChange={(e) => updateStarter(i, e.target.value)}
                placeholder={`Example ${i + 1} — e.g. "What's your biggest project?"`}
                maxLength={MAX_STARTER_CHARS}
                disabled={savingCustomization}
                data-testid={`chatbot-starter-${i}`}
              />
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Button
              size="sm"
              onClick={saveCustomization}
              disabled={savingCustomization}
              data-testid="chatbot-customization-save"
            >
              {savingCustomization ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  Save customization
                </>
              )}
            </Button>
          </div>

          {customizationError && (
            <p role="alert" className="flex items-start gap-1.5 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {customizationError}
            </p>
          )}
          {customizationSuccess && (
            <p role="status" className="flex items-start gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              {customizationSuccess}
            </p>
          )}
        </div>

        <Separator />

        {/* Transcripts */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium">Recent conversations</h4>
              <p className="text-xs text-muted-foreground">
                The last 25 visitor sessions, most recent first.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadSessions}
              disabled={loadingSessions}
              data-testid="chatbot-transcripts-refresh"
            >
              {loadingSessions ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>

          {sessions === null && loadingSessions && (
            <p className="text-xs text-muted-foreground">Loading…</p>
          )}
          {sessions !== null && sessions.length === 0 && (
            <p
              className="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground"
              data-testid="chatbot-transcripts-empty"
            >
              No visitor conversations yet. They&apos;ll appear here as soon
              as someone starts a chat on your published site.
            </p>
          )}
          {sessions !== null && sessions.length > 0 && (
            <ul
              className="space-y-2"
              data-testid="chatbot-transcripts-list"
            >
              {sessions.map((s) => (
                <li
                  key={s.id}
                  className="rounded-md border px-3 py-2 text-xs"
                >
                  <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>
                      {s.messageCount} message{s.messageCount === 1 ? "" : "s"}
                    </span>
                    <time>
                      {s.updatedAt
                        ? new Date(s.updatedAt).toLocaleString()
                        : "—"}
                    </time>
                  </div>
                  {s.preview.lastVisitorMessage && (
                    <p className="line-clamp-2 text-foreground">
                      <span className="font-medium">Q:</span>{" "}
                      {s.preview.lastVisitorMessage}
                    </p>
                  )}
                  {s.preview.lastAssistantReply && (
                    <p className="line-clamp-3 text-muted-foreground">
                      <span className="font-medium">A:</span>{" "}
                      {s.preview.lastAssistantReply}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground">
        Requires an OpenAI key (platform or your BYOK) for embeddings +
        answers. Visitor messages are capped and rate-limited; see the
        docs for details.
      </CardFooter>
    </Card>
  );
}
