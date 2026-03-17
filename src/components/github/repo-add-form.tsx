"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Star,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Plus,
  GitFork,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RepoValidationResult {
  name: string;
  fullName: string;
  description: string | null;
  stars: number;
  forks: number;
  language: string | null;
  htmlUrl: string;
  owner: string;
  isPrivate: boolean;
  defaultBranch: string;
  topics: string[];
}

interface RepoAddFormProps {
  portfolioId: string;
  onProjectAdded?: () => void;
}

type FormStep = "input" | "validating" | "preview" | "adding" | "success" | "error";

// ─── Helpers ────────────────────────────────────────────────────────────────

const GITHUB_URL_REGEX =
  /^https?:\/\/(www\.)?github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)\/?$/;

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const trimmed = url.trim();
  const match = trimmed.match(GITHUB_URL_REGEX);
  if (match) {
    return { owner: match[2], repo: match[3].replace(/\.git$/, "") };
  }
  // Also support shorthand "owner/repo"
  const shortMatch = trimmed.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (shortMatch) {
    return { owner: shortMatch[1], repo: shortMatch[2] };
  }
  return null;
}

function formatStarCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return count.toString();
}

// ─── Language Color Map ─────────────────────────────────────────────────────

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "bg-blue-500",
  JavaScript: "bg-yellow-400",
  Python: "bg-green-500",
  Rust: "bg-orange-600",
  Go: "bg-cyan-500",
  Java: "bg-red-500",
  "C++": "bg-pink-500",
  C: "bg-gray-500",
  Ruby: "bg-red-600",
  Swift: "bg-orange-400",
  Kotlin: "bg-purple-500",
  Dart: "bg-sky-400",
  PHP: "bg-indigo-400",
  Shell: "bg-emerald-500",
  HTML: "bg-orange-500",
  CSS: "bg-purple-400",
};

// ─── Component ──────────────────────────────────────────────────────────────

export function RepoAddForm({ portfolioId, onProjectAdded }: RepoAddFormProps) {
  const [url, setUrl] = useState("");
  const [step, setStep] = useState<FormStep>("input");
  const [validationResult, setValidationResult] = useState<RepoValidationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [clientError, setClientError] = useState("");

  const resetForm = useCallback(() => {
    setUrl("");
    setStep("input");
    setValidationResult(null);
    setErrorMessage("");
    setClientError("");
  }, []);

  const validateUrl = useCallback((value: string): string => {
    if (!value.trim()) {
      return "Please enter a GitHub repository URL";
    }
    const parsed = parseGitHubUrl(value);
    if (!parsed) {
      return "Invalid format. Use https://github.com/owner/repo or owner/repo";
    }
    return "";
  }, []);

  const handleValidate = useCallback(async () => {
    const error = validateUrl(url);
    if (error) {
      setClientError(error);
      return;
    }
    setClientError("");

    const parsed = parseGitHubUrl(url)!;
    const fullUrl = `https://github.com/${parsed.owner}/${parsed.repo}`;

    setStep("validating");
    setErrorMessage("");

    try {
      const response = await fetch("/api/github/repos/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: fullUrl }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          data.error || `Validation failed (${response.status})`
        );
      }

      const data = await response.json();
      setValidationResult(data);
      setStep("preview");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to validate repository"
      );
      setStep("error");
    }
  }, [url, validateUrl]);

  const handleAddToPortfolio = useCallback(async () => {
    if (!validationResult) return;

    setStep("adding");
    setErrorMessage("");

    try {
      const response = await fetch(
        `/api/portfolios/${portfolioId}/projects`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repoUrl: validationResult.htmlUrl,
            repoOwner: validationResult.owner,
            repoName: validationResult.name,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          data.error || `Failed to add project (${response.status})`
        );
      }

      setStep("success");
      onProjectAdded?.();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to add project"
      );
      setStep("error");
    }
  }, [validationResult, portfolioId, onProjectAdded]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && step === "input") {
        e.preventDefault();
        handleValidate();
      }
    },
    [step, handleValidate]
  );

  const isLoading = step === "validating" || step === "adding";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Add Repository</CardTitle>
        <CardDescription>
          Paste a GitHub repository URL to add it to your portfolio
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* URL Input */}
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              placeholder="https://github.com/owner/repo"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (clientError) setClientError("");
                if (step === "error" || step === "success") {
                  setStep("input");
                  setErrorMessage("");
                }
              }}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              className={cn(clientError && "border-destructive")}
              aria-label="GitHub repository URL"
              aria-invalid={!!clientError}
              aria-describedby={clientError ? "url-error" : undefined}
            />
            {clientError && (
              <p
                id="url-error"
                className="mt-1.5 text-sm text-destructive flex items-center gap-1"
              >
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                {clientError}
              </p>
            )}
          </div>
          <Button
            onClick={handleValidate}
            disabled={isLoading || !url.trim()}
            size="default"
          >
            {step === "validating" ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Validating
              </>
            ) : (
              "Validate"
            )}
          </Button>
        </div>

        {/* Validation Result Preview */}
        {step === "preview" && validationResult && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-sm truncate">
                    {validationResult.fullName}
                  </h4>
                  {validationResult.isPrivate && (
                    <Badge variant="outline" className="text-xs flex-shrink-0">
                      Private
                    </Badge>
                  )}
                </div>
                {validationResult.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {validationResult.description}
                  </p>
                )}
              </div>
              <a
                href={validationResult.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                aria-label="Open repository on GitHub"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              {validationResult.language && (
                <span className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "h-3 w-3 rounded-full",
                      LANGUAGE_COLORS[validationResult.language] ||
                        "bg-gray-400"
                    )}
                  />
                  {validationResult.language}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Star className="h-3.5 w-3.5" />
                {formatStarCount(validationResult.stars)}
              </span>
              <span className="flex items-center gap-1">
                <GitFork className="h-3.5 w-3.5" />
                {formatStarCount(validationResult.forks)}
              </span>
            </div>

            {validationResult.topics.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {validationResult.topics.slice(0, 8).map((topic) => (
                  <Badge
                    key={topic}
                    variant="secondary"
                    className="text-xs font-normal"
                  >
                    {topic}
                  </Badge>
                ))}
                {validationResult.topics.length > 8 && (
                  <Badge variant="secondary" className="text-xs font-normal">
                    +{validationResult.topics.length - 8} more
                  </Badge>
                )}
              </div>
            )}
          </div>
        )}

        {/* Error State */}
        {step === "error" && errorMessage && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-destructive">
                {errorMessage}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStep("input");
                  setErrorMessage("");
                }}
                className="h-auto p-0 text-sm text-muted-foreground hover:text-foreground"
              >
                Try again
              </Button>
            </div>
          </div>
        )}

        {/* Success State */}
        {step === "success" && (
          <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-4 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-green-600 dark:text-green-400">
                Repository added to your portfolio!
              </p>
              <p className="text-sm text-muted-foreground">
                You can now analyze it to generate portfolio content.
              </p>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex justify-between">
        {step === "preview" && validationResult ? (
          <>
            <Button variant="outline" onClick={resetForm}>
              Cancel
            </Button>
            <Button onClick={handleAddToPortfolio} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Add to Portfolio
                </>
              )}
            </Button>
          </>
        ) : step === "success" ? (
          <Button variant="outline" onClick={resetForm} className="ml-auto">
            Add Another
          </Button>
        ) : null}
      </CardFooter>
    </Card>
  );
}
