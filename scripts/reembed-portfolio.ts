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

// Load .env.local + .env before importing modules that read DATABASE_URL
// at module init time. Mirrors scripts/seed-db.ts's parser exactly so this
// script works in the same envs the seed script does.
for (const file of [".env.local", ".env"]) {
  try {
    const contents = readFileSync(resolve(process.cwd(), file), "utf-8");
    for (const rawLine of contents.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // Both files are optional.
  }
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

  // The projects table has no `name` column — use displayName or repoName
  // for the human-readable label, falling back to a truncated id.
  const rows = await db
    .select({
      id: projects.id,
      displayName: projects.displayName,
      repoName: projects.repoName,
    })
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
    const label = row.displayName ?? row.repoName ?? row.id.slice(0, 8);
    process.stdout.write(`  ${label} ...`);
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
