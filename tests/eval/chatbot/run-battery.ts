/**
 * Visitor-chatbot eval battery.
 *
 * Runs the question set in `questions.json` against a deployed
 * /api/chat/message endpoint, captures replies + latencies, writes a
 * timestamped JSONL to `tests/eval/chatbot/results/`, and prints a
 * one-line-per-question summary the operator can manually score.
 *
 * Usage:
 *   npm run eval:chatbot -- <portfolioId> <baseUrl> [ownerName]
 *
 * Examples:
 *   npm run eval:chatbot -- 236f55c5-... https://shashank-cm.dev "Shashank C M"
 *   npm run eval:chatbot -- 236f55c5-... http://localhost:3000
 *
 * The `ownerName` is interpolated into questions where the JSON uses
 * the literal "<NAME>" placeholder. Defaults to "the portfolio owner".
 *
 * No automated scoring. The script's job is to make a re-runnable
 * record; manual scoring lives in the PR description / commit message
 * the operator writes after eyeballing the JSONL.
 *
 * History:
 *   - R8.x eval-loop: this battery was built incrementally during the
 *     chunker/prompt iteration that took the chatbot from 6/15 ✅
 *     baseline to 12/19 ✅ in v6. Each iteration's results are kept
 *     under tests/eval/chatbot/results/ for diff-vs-history.
 *   - 19 questions cover: identity, employment, availability,
 *     technical, projects, edge (salary refusal), relocation,
 *     eligibility, tenure.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";

interface Question {
  id: number;
  category: string;
  q: string;
  outOfScope?: boolean;
  outOfScopeNote?: string;
}

interface QuestionFile {
  description: string;
  questions: Question[];
}

interface Result {
  i: number;
  category: string;
  q: string;
  reply: string | null;
  latency: number;
  err: string | null;
  outOfScope: boolean;
}

async function ask(
  baseUrl: string,
  portfolioId: string,
  question: string,
  visitorId: string
): Promise<{ reply: string | null; latency: number; err: string | null }> {
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portfolioId,
        visitorId,
        message: question,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const latency = (Date.now() - start) / 1000;
    if (!res.ok) {
      const body = await res.text();
      return {
        reply: null,
        latency,
        err: `HTTP ${res.status}: ${body.slice(0, 200)}`,
      };
    }
    const data = (await res.json()) as { reply?: string };
    return { reply: data.reply ?? "<no reply>", latency, err: null };
  } catch (e) {
    const latency = (Date.now() - start) / 1000;
    return {
      reply: null,
      latency,
      err: e instanceof Error ? e.message : String(e),
    };
  }
}

async function main(): Promise<void> {
  const portfolioId = process.argv[2];
  const baseUrl = process.argv[3];
  const ownerName = process.argv[4] ?? "the portfolio owner";

  if (!portfolioId || !baseUrl) {
    console.error(
      "Usage: npm run eval:chatbot -- <portfolioId> <baseUrl> [ownerName]"
    );
    console.error("");
    console.error("Examples:");
    console.error(
      '  npm run eval:chatbot -- 236f55c5-... https://shashank-cm.dev "Shashank C M"'
    );
    console.error(
      "  npm run eval:chatbot -- 236f55c5-... http://localhost:3000"
    );
    process.exit(1);
  }

  const here = dirname(new URL(import.meta.url).pathname);
  const questionsPath = resolve(here, "questions.json");
  const file = JSON.parse(readFileSync(questionsPath, "utf-8")) as QuestionFile;

  const resultsDir = resolve(here, "results");
  if (!existsSync(resultsDir)) mkdirSync(resultsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = resolve(resultsDir, `${stamp}.jsonl`);

  console.log(`Running ${file.questions.length} questions vs ${baseUrl}`);
  console.log(`Portfolio: ${portfolioId}`);
  console.log(`Output:    ${outPath}`);
  console.log("");

  const results: Result[] = [];
  for (const q of file.questions) {
    const interpolated = q.q.replace(/<NAME>/g, ownerName);
    process.stdout.write(
      `[${String(q.id).padStart(2)}] ${q.category.padEnd(14)} ${interpolated.slice(0, 50).padEnd(50)} ... `
    );
    const visitorId = `eval-${stamp}-${q.id}`;
    const { reply, latency, err } = await ask(
      baseUrl,
      portfolioId,
      interpolated,
      visitorId
    );
    if (err) {
      console.log(`ERR (${latency.toFixed(1)}s) ${err.slice(0, 80)}`);
    } else {
      console.log(`OK (${latency.toFixed(1)}s)`);
    }
    results.push({
      i: q.id,
      category: q.category,
      q: interpolated,
      reply,
      latency,
      err,
      outOfScope: q.outOfScope === true,
    });
    // Spacing between requests so we don't hammer Workers AI.
    await new Promise((r) => setTimeout(r, 600));
  }

  const lines = results.map((r) => JSON.stringify(r));
  writeFileSync(outPath, lines.join("\n") + "\n", "utf-8");

  const okCount = results.filter((r) => r.err === null).length;
  const errCount = results.length - okCount;
  console.log("");
  console.log(`Done. ${okCount} ok, ${errCount} error. → ${outPath}`);
  console.log(
    "Manual scoring: read the JSONL, label each reply ✅ / 🟡 / ❌ / 🚫 (out-of-scope refusal)."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
