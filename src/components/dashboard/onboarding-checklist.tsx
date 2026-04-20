import Link from "next/link";
import { Check, Circle, ArrowRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Three-step first-run checklist shown on the dashboard for new users.
 *
 * Server-rendered: the dashboard already knows the user's counts, so we just
 * take flags and derive the current step. When all three are complete, the
 * parent should hide this widget entirely (it has no "all done" state of its
 * own — the dashboard already has a real activity feed for established users).
 */

interface OnboardingChecklistProps {
  hasResume: boolean;
  hasPortfolio: boolean;
  hasProject: boolean;
  portfolioId?: string | null;
}

export function OnboardingChecklist({
  hasResume,
  hasPortfolio,
  hasProject,
  portfolioId,
}: OnboardingChecklistProps) {
  const steps = [
    {
      title: "Upload your resume",
      description: "We parse it to pre-fill your portfolio",
      done: hasResume,
      active: !hasResume,
      href: "/settings",
      cta: "Upload resume",
    },
    {
      title: "Create your first portfolio",
      description: "Choose a name and template",
      done: hasPortfolio,
      active: hasResume && !hasPortfolio,
      href: "/portfolios/new",
      cta: "Create portfolio",
    },
    {
      title: "Add a GitHub repo",
      description: "We'll analyze it to write the narrative",
      done: hasProject,
      active: hasPortfolio && !hasProject,
      href: portfolioId
        ? `/portfolios/${portfolioId}?tab=projects`
        : "/portfolios",
      cta: "Add project",
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;

  return (
    <Card className="border-primary/30 bg-primary/[0.03]">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg">Get started</CardTitle>
            <CardDescription>
              {doneCount === 0
                ? "Three steps to a live portfolio."
                : `${doneCount} of ${steps.length} done — keep going!`}
            </CardDescription>
          </div>
          <div className="text-xs font-medium text-muted-foreground">
            {doneCount}/{steps.length}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2">
          {steps.map((step, i) => (
            <li key={step.title}>
              <Link
                href={step.href}
                className={cn(
                  "flex items-center gap-3 rounded-md border p-3 transition-colors",
                  step.done
                    ? "border-transparent bg-muted/40"
                    : step.active
                      ? "border-primary/40 bg-background hover:bg-muted/50"
                      : "border-transparent opacity-60 hover:opacity-100"
                )}
                aria-current={step.active ? "step" : undefined}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
                    step.done
                      ? "border-green-500 bg-green-500 text-white"
                      : step.active
                        ? "border-primary bg-background text-primary"
                        : "border-muted-foreground/30 bg-background text-muted-foreground"
                  )}
                >
                  {step.done ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span className="text-xs font-semibold">{i + 1}</span>
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-sm font-medium",
                      step.done && "line-through decoration-muted-foreground/50"
                    )}
                  >
                    {step.title}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {step.description}
                  </span>
                </span>

                {step.active ? (
                  <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
                    {step.cta}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                ) : step.done ? null : (
                  <Circle
                    className="h-4 w-4 shrink-0 text-muted-foreground/30"
                    aria-hidden
                  />
                )}
              </Link>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
