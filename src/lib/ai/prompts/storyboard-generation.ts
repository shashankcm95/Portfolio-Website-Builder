import type { ContextPack } from "@/lib/ai/schemas/context-pack";
import type {
  CredibilitySignals,
  StoredCredibilitySignals,
} from "@/lib/credibility/types";

/**
 * Build the system + user prompts for a single-call storyboard generation.
 *
 * The model gets a curated snapshot of the repo:
 *   - context pack (tech stack, architecture, key features)
 *   - parsed dependencies (names only)
 *   - curated file tree (≤150 paths — see file-tree-curation)
 *   - first 2000 chars of README
 *   - homepage URL (if declared)
 *   - authorship verdict + credibility signals summary (for card accuracy)
 *
 * It emits a `StoryboardPayload` — 6 cards + a mermaid diagram — with every
 * claim tagged with a `verifier` so we can re-check it deterministically
 * before rendering.
 */
export interface StoryboardPromptInput {
  projectName: string;
  contextPack: ContextPack;
  curatedFileTree: string[];
  dependencyNames: string[];
  readmeExcerpt: string;
  homepage: string | null;
  credibilitySignals:
    | CredibilitySignals
    | StoredCredibilitySignals
    | null;
  cloneUrl: string; // used for Card 6 "Try it" clone command
}

export function buildStoryboardPrompt(input: StoryboardPromptInput): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `You are a technical writer creating a scannable 6-card guided tour of a GitHub project for a recruiter. The recruiter has 20 seconds and no intention of cloning the repo.

You MUST return a JSON object matching this shape exactly:
  {
    "schemaVersion": 1,
    "cards": [ <6 cards in order: what, how, interesting_file, tested, deploys, try_it> ],
    "mermaid": "<valid mermaid diagram source>"
  }

CARD RULES
- Each card has id, icon (lucide-react icon name like "Lightbulb"), title (≤80 chars), description (≤2 sentences, ≤400 chars), claims (array, 1-3 entries).
- Card 1 "what": elevator pitch — what this project is and the problem it solves.
- Card 2 "how": 2-sentence architecture summary. The mermaid diagram at the payload root covers the visual.
- Card 3 "interesting_file": pick ONE non-obvious file from the tree whose existence tells you something about the developer's thinking. Include an \`extra\` of kind "file_snippet" with path + a ≤2000-char snippet + language (guess from extension).
- Card 4 "tested": test framework, test locations, CI test workflows (if any).
- Card 5 "deploys": CI/CD workflows + deployment target if evident.
- Card 6 "try_it": if a homepage URL exists, include \`extra\` kind "demo" with that URL. Otherwise include kind "demo" with just a \`cloneCommand\` string like "git clone <url>".

CLAIM RULES — CRITICAL
Every claim MUST carry a "verifier" object. Claims without a verifier will be DROPPED. Verifier kinds:
  - { "kind": "dep", "package": "<name>", "ecosystem": "npm"|"pypi"|"cargo"|"go" } — checks a package in dependencies
  - { "kind": "file", "glob": "<pattern>" } — checks if any file matches (supports *, **, ?)
  - { "kind": "workflow", "category": "test"|"deploy"|"lint"|"security"|"release" } — checks for a CI workflow of that category
  - { "kind": "grep", "pattern": "<regex>", "sources": ["readme"|"file_tree"|"dependencies"] } — checks a regex against one or more source blobs

Pick the CHEAPEST verifier that proves the claim. Prefer dep > file > workflow > grep. Each claim label must be ≤120 chars.

MERMAID RULES
- Return valid mermaid flowchart syntax (graph TD or graph LR).
- Keep it to ≤10 nodes. Prefer high-level components (frontend, API, DB, external services).
- No fancy icons, no CSS, no subgraphs unless truly needed.

STYLE
- Be concrete. "Uses JWT" > "Has authentication". "Tests with Jest" > "Is well-tested".
- Do NOT hallucinate features not evidenced by the inputs.
- Do NOT claim metrics (user counts, uptime, speed) unless they appear in the README.
- Professional but conversational. Avoid marketing language.`;

  const signalsSummary = summarizeSignals(input.credibilitySignals);
  const userPrompt = `Project: ${input.projectName}

=== CONTEXT PACK ===
${JSON.stringify(input.contextPack, null, 2)}

=== DEPENDENCIES (parsed names) ===
${input.dependencyNames.slice(0, 100).join(", ") || "(none parsed)"}

=== FILE TREE (curated, ${input.curatedFileTree.length} paths) ===
${input.curatedFileTree.join("\n")}

=== README (first 2000 chars) ===
${input.readmeExcerpt.slice(0, 2000)}

=== HOMEPAGE / DEPLOY URL ===
${input.homepage ?? "(none declared)"}

=== CREDIBILITY SIGNALS ===
${signalsSummary}

=== CLONE URL ===
${input.cloneUrl}

Produce the 6-card storyboard + mermaid diagram now. Return JSON only, no commentary.`;

  return { systemPrompt, userPrompt };
}

function summarizeSignals(
  signals: CredibilitySignals | StoredCredibilitySignals | null
): string {
  if (!signals) return "(no credibility data)";
  const lines: string[] = [];
  if (signals.ci?.status === "ok") {
    lines.push(`CI: ${signals.ci.conclusion}`);
  } else if (signals.ci?.status === "missing") {
    lines.push("CI: none configured");
  }
  if (signals.workflows?.status === "ok") {
    const cats = Object.entries(signals.workflows.categories)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${k}:${n}`)
      .join(", ");
    lines.push(`Workflows: ${cats || "(none)"}`);
  }
  if (signals.testFramework?.status === "ok") {
    lines.push(`Test framework: ${signals.testFramework.name}`);
  }
  if (signals.verifiedStack?.status === "ok") {
    lines.push(
      `Stack: ${signals.verifiedStack.items.slice(0, 8).join(", ")}`
    );
  }
  if (signals.languages?.status === "ok") {
    const top = signals.languages.breakdown.slice(0, 3);
    lines.push(`Languages: ${top.map((l) => `${l.name} ${l.pct}%`).join(", ")}`);
  }
  if (signals.authorshipSignal?.status === "ok") {
    lines.push(
      `Authorship verdict: ${signals.authorshipSignal.verdict} (${signals.authorshipSignal.positiveCount}/6 positive)`
    );
  }
  return lines.length > 0 ? lines.join("\n") : "(signals unavailable)";
}
