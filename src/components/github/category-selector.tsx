"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { REPO_CATEGORIES, type RepoCategory } from "@/lib/credibility/types";
import { visualFor } from "@/components/github/project-category-badge";

interface CategorySelectorProps {
  value: RepoCategory;
  onChange: (value: RepoCategory) => void;
  disabled?: boolean;
  /**
   * When true, the selector is uncontrolled-styled as a tiny inline
   * dropdown for use inside the strengthen panel. Default layout is a
   * full-width labelled control suitable for forms.
   */
  compact?: boolean;
  className?: string;
}

/**
 * Phase 8 — 4-way (+ unspecified) category selector.
 *
 * Used in two places:
 *   1. The inline strengthen panel next to the category badge ("change
 *      category" affordance), where it defaults to compact.
 *   2. Future bulk-edit flows that want a labelled field.
 *
 * Wraps the existing Radix-based `<Select>` so styling and a11y stay
 * consistent with the rest of the app.
 */
export function CategorySelector({
  value,
  onChange,
  disabled,
  compact = false,
  className,
}: CategorySelectorProps) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as RepoCategory)}
      disabled={disabled}
    >
      <SelectTrigger
        className={cn(
          compact ? "h-7 w-[200px] text-xs" : "w-full",
          className
        )}
        data-testid="category-selector"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {REPO_CATEGORIES.map((category) => {
          const visual = visualFor(category);
          return (
            <SelectItem key={category} value={category} className="text-xs">
              <div className="flex items-center gap-2">
                <visual.Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{visual.label}</span>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
