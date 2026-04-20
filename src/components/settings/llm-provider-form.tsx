"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Key,
  Loader2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ANTHROPIC_MODELS,
  DEFAULT_MODELS,
  OPENAI_MODELS,
} from "@/lib/ai/providers/allowlist";
import type {
  BYOKSettings,
  LlmProvider,
} from "@/lib/ai/providers/types";

/**
 * Settings form for the user's bring-your-own-key LLM provider.
 * Flow:
 *   1. Load current settings via GET /api/settings/llm (no plaintext).
 *   2. User picks provider → model list filters.
 *   3. User pastes API key; hitting Save fires PUT which validates + persists.
 *   4. Clear fires DELETE.
 */
export function LlmProviderForm() {
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState<BYOKSettings | null>(null);
  const [provider, setProvider] = useState<LlmProvider>("openai");
  const [model, setModel] = useState<string>(DEFAULT_MODELS.openai);
  const [apiKey, setApiKey] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load current settings
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/settings/llm");
        if (res.ok) {
          const data = (await res.json()) as BYOKSettings;
          setSettings(data);
          if (data.provider) setProvider(data.provider);
          if (data.model) setModel(data.model);
          else setModel(DEFAULT_MODELS[data.provider ?? "openai"]);
        }
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // Reset model when provider switches; also clear the key input so a
  // paste from the wrong slot doesn't accidentally save.
  const onProviderChange = useCallback((next: string) => {
    const p = next as LlmProvider;
    setProvider(p);
    setModel(DEFAULT_MODELS[p]);
    setApiKey("");
    setError(null);
    setSuccess(null);
  }, []);

  const modelOptions = useMemo(
    () => (provider === "openai" ? OPENAI_MODELS : ANTHROPIC_MODELS),
    [provider]
  );

  const save = useCallback(async () => {
    if (saving) return;
    setError(null);
    setSuccess(null);
    if (!apiKey.trim()) {
      setError("Paste an API key to save.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/llm", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: apiKey.trim(), model }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Save failed");
        return;
      }
      const data = (await res.json()) as BYOKSettings;
      setSettings(data);
      setApiKey(""); // clear the input after a successful save
      setSuccess("Key validated and saved.");
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }, [apiKey, model, provider, saving]);

  const clear = useCallback(async () => {
    if (clearing) return;
    setClearing(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/settings/llm", { method: "DELETE" });
      if (!res.ok) {
        setError("Clear failed");
        return;
      }
      setSettings({
        provider: null,
        model: null,
        hasKey: false,
        lastValidatedAt: null,
        lastFailureAt: null,
        lastFailureReason: null,
      });
      setApiKey("");
      setSuccess("BYOK cleared. Falls back to platform default.");
    } catch {
      setError("Network error");
    } finally {
      setClearing(false);
    }
  }, [clearing]);

  if (!loaded) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading your AI provider settings…
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="llm-provider-form">
      {/* Status line */}
      <StatusLine settings={settings} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="llm-provider">Provider</Label>
          <Select value={provider} onValueChange={onProviderChange}>
            <SelectTrigger id="llm-provider" aria-label="LLM provider">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="anthropic">Anthropic</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="llm-model">Model</Label>
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger id="llm-model" aria-label="LLM model">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modelOptions.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="llm-api-key">
          API Key
          {settings?.hasKey && (
            <span className="ml-2 text-xs text-muted-foreground">
              (leave empty to keep the existing key)
            </span>
          )}
        </Label>
        <Input
          id="llm-api-key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={
            settings?.hasKey
              ? "•••••••• (hidden — paste a new one to replace)"
              : provider === "openai"
                ? "sk-…"
                : "sk-ant-…"
          }
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          disabled={saving}
        />
      </div>

      {/* Feedback */}
      {error && (
        <p
          className="flex items-start gap-1.5 text-sm text-destructive"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
      {success && (
        <p
          className={cn(
            "flex items-start gap-1.5 text-sm",
            "text-emerald-700 dark:text-emerald-400"
          )}
          role="status"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          {success}
        </p>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Button onClick={save} disabled={saving || !apiKey.trim()} size="sm">
          {saving ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Validating…
            </>
          ) : (
            <>
              <Key className="mr-1.5 h-3.5 w-3.5" />
              Save & Validate
            </>
          )}
        </Button>
        {settings?.hasKey && (
          <Button
            onClick={clear}
            variant="outline"
            size="sm"
            disabled={clearing}
          >
            {clearing ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            )}
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Status line ────────────────────────────────────────────────────────────

function StatusLine({ settings }: { settings: BYOKSettings | null }) {
  if (!settings || !settings.hasKey) {
    return (
      <p className="text-xs text-muted-foreground">
        No BYOK configured. LLM features use the platform default (if set).
      </p>
    );
  }
  if (settings.lastFailureReason && !settings.lastValidatedAt) {
    return (
      <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Last save failed: {settings.lastFailureReason}
      </p>
    );
  }
  const when = settings.lastValidatedAt
    ? new Date(settings.lastValidatedAt).toLocaleString()
    : "—";
  return (
    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
      Using {settings.provider} · {settings.model} · last validated {when}
    </p>
  );
}
