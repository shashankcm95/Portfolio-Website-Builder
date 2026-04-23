/**
 * @jest-environment node
 *
 * Phase R3 — Unit tests for the deterministic helpers inside
 * `src/lib/generator/profile-data.ts`.
 *
 * These are the building blocks the whole publish pipeline hinges on:
 *
 *   - `deriveAnchorStat` is the code-only ranker that picks the single
 *     strongest credential the hero leads with. Getting it wrong ships
 *     the wrong "anchor" to every portfolio.
 *
 *   - `filterEvidencedSkills` drops the skills-as-logo-grid noise we
 *     identified in the code review. The filter + sort must be stable
 *     so templates render a consistent order across re-publishes.
 *
 *   - `parseMagnitude`, `formatCount`, `extractEmployerNames` — small
 *     helpers, but tiny bugs here cascade into ranking regressions.
 *
 * No DB, no LLM, no file I/O. Pure input → output.
 */

import type { Project, Skill } from "@/templates/_shared/types";
import {
  deriveAnchorStat,
  extractEmployerNames,
  filterEvidencedSkills,
  formatCount,
  parseMagnitude,
} from "@/lib/generator/profile-data";

// ─── parseMagnitude ──────────────────────────────────────────────────────────

describe("parseMagnitude", () => {
  it("parses plain integers", () => {
    expect(parseMagnitude("123")).toBe(123);
  });

  it("parses decimals", () => {
    expect(parseMagnitude("1.5")).toBe(1.5);
  });

  it("expands k/M/B suffixes case-insensitively", () => {
    expect(parseMagnitude("4k")).toBe(4000);
    expect(parseMagnitude("4K")).toBe(4000);
    expect(parseMagnitude("2.5M")).toBe(2_500_000);
    expect(parseMagnitude("1B")).toBe(1e9);
  });

  it("tolerates +/% trailing chars", () => {
    expect(parseMagnitude("80%")).toBe(80);
    expect(parseMagnitude("4k+")).toBe(4000);
  });

  it("returns 0 when no digits present", () => {
    expect(parseMagnitude("abc")).toBe(0);
    expect(parseMagnitude("")).toBe(0);
  });
});

// ─── formatCount ─────────────────────────────────────────────────────────────

describe("formatCount", () => {
  it("renders sub-1000 values with '+' suffix", () => {
    expect(formatCount(42)).toBe("42+");
  });

  it("renders thousand-scale values as Nk+ with one decimal when useful", () => {
    expect(formatCount(1500)).toBe("1.5k+");
    expect(formatCount(10_000)).toBe("10k+");
    expect(formatCount(12_345)).toBe("12.3k+");
  });
});

// ─── extractEmployerNames ────────────────────────────────────────────────────

describe("extractEmployerNames", () => {
  it("returns [] for null or missing `work`", () => {
    expect(extractEmployerNames(null)).toEqual([]);
    expect(extractEmployerNames({})).toEqual([]);
    expect(extractEmployerNames({ work: "not-an-array" })).toEqual([]);
  });

  it("reads work[].name, falls back to work[].company", () => {
    expect(
      extractEmployerNames({
        work: [
          { name: "Apple" },
          { company: "Klaviyo" },
          { name: "Vercel", company: "ignored-fallback" },
        ],
      })
    ).toEqual(["Apple", "Klaviyo", "Vercel"]);
  });

  it("dedupes repeats", () => {
    expect(
      extractEmployerNames({
        work: [{ name: "Apple" }, { name: "Apple" }, { company: "Apple" }],
      })
    ).toEqual(["Apple"]);
  });

  it("skips entries with no name or company", () => {
    expect(
      extractEmployerNames({
        work: [{ name: "Apple" }, { position: "IC4" }, {}],
      })
    ).toEqual(["Apple"]);
  });
});

// ─── filterEvidencedSkills ───────────────────────────────────────────────────

function skill(
  name: string,
  evidenceCount: number,
  category: Skill["category"] = "framework"
): Skill {
  return {
    name,
    category,
    evidence: Array.from({ length: evidenceCount }, (_, i) => ({
      projectName: `proj-${i}`,
      usage: `used in proj-${i}`,
    })),
  };
}

describe("filterEvidencedSkills", () => {
  it("drops skills with no evidence entries", () => {
    const result = filterEvidencedSkills([
      skill("React", 2),
      { name: "Unbacked", category: "framework" },
      skill("TypeScript", 1),
    ]);
    expect(result.map((s) => s.name)).toEqual(["React", "TypeScript"]);
  });

  it("drops skills where evidence is an empty array (not just absent)", () => {
    const bare: Skill = {
      name: "Empty",
      category: "framework",
      evidence: [],
    };
    expect(filterEvidencedSkills([bare])).toEqual([]);
  });

  it("sorts by evidence count descending, then by name ascending (stable)", () => {
    const result = filterEvidencedSkills([
      skill("Rust", 1),
      skill("React", 5),
      skill("Python", 5),
      skill("Go", 2),
    ]);
    // Two 5-evidence skills: alphabetical → Python before React
    expect(result.map((s) => s.name)).toEqual([
      "Python",
      "React",
      "Go",
      "Rust",
    ]);
  });

  it("returns [] unchanged for empty input", () => {
    expect(filterEvidencedSkills([])).toEqual([]);
  });
});

// ─── deriveAnchorStat ────────────────────────────────────────────────────────

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "p",
    name: "Demo Project",
    repoUrl: "https://github.com/acme/demo",
    description: "",
    techStack: [],
    isFeatured: false,
    displayOrder: 0,
    sections: { summary: "" },
    metadata: {},
    facts: [],
    ...overrides,
  };
}

describe("deriveAnchorStat", () => {
  it("returns undefined when nothing ranks", () => {
    expect(deriveAnchorStat([], [], null)).toBeUndefined();
  });

  it("picks an outcome over employer-only portfolios", () => {
    const projects = [
      project({
        name: "Tool",
        outcomes: [
          { metric: "Monthly active users", value: "5k" },
        ],
      }),
    ];
    const anchor = deriveAnchorStat(projects, ["Apple"], null);
    expect(anchor?.value).toBe("5k");
    expect(anchor?.unit).toBe("Monthly active users");
  });

  it("picks the highest-magnitude outcome across multiple projects", () => {
    const projects = [
      project({
        name: "Small",
        outcomes: [{ metric: "Downloads", value: "200" }],
      }),
      project({
        name: "Big",
        outcomes: [{ metric: "Downloads", value: "10M" }],
      }),
      project({
        name: "Medium",
        outcomes: [{ metric: "Downloads", value: "50k" }],
      }),
    ];
    const anchor = deriveAnchorStat(projects, [], null);
    expect(anchor?.value).toBe("10M");
  });

  it("picks GitHub stars (>=10) over named employers", () => {
    const projects = [
      project({
        name: "OSS Thing",
        metadata: { stars: 250 },
      }),
    ];
    const anchor = deriveAnchorStat(projects, ["Apple", "Klaviyo"], null);
    expect(anchor?.unit).toBe("GitHub stars");
    // 250 formatted as "250+" (sub-1000 path)
    expect(anchor?.value).toBe("250+");
  });

  it("ignores GitHub stars below the OSS-author floor of 10", () => {
    const projects = [
      project({ name: "Tiny", metadata: { stars: 3 } }),
    ];
    const anchor = deriveAnchorStat(projects, ["Apple"], null);
    // Falls through to employer anchor
    expect(anchor?.value).toBe("Previously at");
    expect(anchor?.unit).toBe("Apple");
  });

  it("ranks outcomes above any GitHub-stars signal (pill carries explicit value+unit)", () => {
    const projects = [
      project({ name: "Stars", metadata: { stars: 10_000 } }),
      project({
        name: "Users",
        outcomes: [{ metric: "Users", value: "100" }],
      }),
    ];
    const anchor = deriveAnchorStat(projects, [], null);
    expect(anchor?.unit).toBe("Users");
    expect(anchor?.value).toBe("100");
  });

  it("falls back to namedEmployers when no numeric signal exists", () => {
    const anchor = deriveAnchorStat([], ["Apple", "Klaviyo", "Vercel"], null);
    expect(anchor?.value).toBe("Previously at");
    expect(anchor?.unit).toBe("Apple, Klaviyo, Vercel");
  });

  it("caps the employer line to 3 names", () => {
    const anchor = deriveAnchorStat(
      [],
      ["Apple", "Klaviyo", "Vercel", "Stripe", "Meta"],
      null
    );
    expect(anchor?.unit).toBe("Apple, Klaviyo, Vercel");
  });

  it("mines resumeJson.work[] when namedEmployers is empty", () => {
    const anchor = deriveAnchorStat(
      [],
      [],
      { work: [{ name: "Apple" }, { name: "Klaviyo" }] }
    );
    expect(anchor?.value).toBe("Previously at");
    expect(anchor?.unit).toBe("Apple, Klaviyo");
  });

  it("attaches sourceRef/context for outcome picks", () => {
    const projects = [
      project({
        name: "With Context",
        repoUrl: "https://github.com/acme/x",
        outcomes: [
          {
            metric: "Load time reduction",
            value: "80%",
            context: "for returning users",
            evidenceRef: "README#perf",
          },
        ],
      }),
    ];
    const anchor = deriveAnchorStat(projects, [], null);
    expect(anchor?.context).toBe("for returning users");
    expect(anchor?.sourceRef).toBe("README#perf");
  });

  it("defaults context to `on <projectName>` when an outcome has no context", () => {
    const projects = [
      project({
        name: "My Tool",
        outcomes: [{ metric: "Stars", value: "2k" }],
      }),
    ];
    const anchor = deriveAnchorStat(projects, [], null);
    expect(anchor?.context).toBe("on My Tool");
  });

  it("defaults context to `on <projectName>` for stars picks", () => {
    const projects = [
      project({
        name: "My Repo",
        metadata: { stars: 42 },
        repoUrl: "https://github.com/acme/r",
      }),
    ];
    const anchor = deriveAnchorStat(projects, [], null);
    expect(anchor?.context).toBe("on My Repo");
    expect(anchor?.sourceRef).toBe("https://github.com/acme/r");
  });
});
