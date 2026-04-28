/**
 * Phase R6 — re-embed every project in a portfolio against the latest
 * chunker. Useful when only the chunking logic has changed (e.g. new
 * career / availability chunks added) and you don't want to re-run the
 * full pipeline (fact extraction / narrative generation / etc).
 *
 * Usage:
 *   npm run reembed:portfolio -- <portfolioId>
 *
 * After this finishes, click Republish in the builder to bake the new
 * vector corpus into the deployed site (`functions/_shared/embeddings.ts`
 * is regenerated at publish time from the embeddings table).
 */
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local before importing the DB client (same pattern as seed-db.ts).
const envPath = resolve(process.cwd(), ".env.local");
try {
  const raw = readFileSync(envPath, "utf-8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  // .env.local optional — environment may already be set.
}

async function main() {
  const portfolioId = process.argv[2];
  if (!portfolioId) {
    console.error(
      "Usage: npm run reembed:portfolio -- <portfolioId>"
    );
    process.exit(1);
  }

  const { db } = await import("../src/lib/db");
  const { projects } = await import("../src/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const { runEmbeddingGenerate } = await import(
    "../src/lib/pipeline/steps/embedding-generate"
  );

  const rows = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(eq(projects.portfolioId, portfolioId));

  if (rows.length === 0) {
    console.error(`No projects found for portfolio ${portfolioId}`);
    process.exit(1);
  }

  console.log(
    `Re-embedding ${rows.length} project${rows.length === 1 ? "" : "s"} in portfolio ${portfolioId}...`
  );

  const ac = new AbortController();
  process.on("SIGINT", () => ac.abort());

  let okCount = 0;
  let errCount = 0;
  for (const row of rows) {
    process.stdout.write(`  ${row.name} ...`);
    try {
      const result = await runEmbeddingGenerate(row.id, ac.signal);
      if (result.ok) {
        process.stdout.write(` ✓ ${result.chunkCount} chunks\n`);
        okCount++;
      } else {
        process.stdout.write(` ✗ ${result.error ?? "unknown"}\n`);
        errCount++;
      }
    } catch (err) {
      process.stdout.write(` ✗ ${err instanceof Error ? err.message : String(err)}\n`);
      errCount++;
    }
  }

  console.log(
    `\nDone. ${okCount} ok, ${errCount} failed. Click Republish in the builder to bake the new corpus into the deploy.`
  );
  process.exit(errCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
