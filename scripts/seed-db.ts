/**
 * Idempotent DB seed. Run with `npm run db:seed`.
 *
 * Currently seeds the `templates` table with the shipped templates so the
 * /api/templates endpoint returns them to the portfolio creation picker.
 */
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local and .env into process.env before importing modules that
// read DATABASE_URL at module init time. Minimal parser (no dep on dotenv).
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
    // File missing is fine.
  }
}

const shippedTemplates = [
  {
    id: "minimal",
    name: "Minimal",
    description:
      "Clean, modern layout with centered hero — great for most developers.",
    isActive: true,
    isPremium: false,
    config: {
      primaryColor: "#2563eb",
      fontFamily: "Inter",
      showGitHubStats: true,
      showTechStack: true,
    },
  },
  {
    id: "classic",
    name: "Classic",
    description:
      "Editorial style with serif typography, warm cream paper, and an asymmetric split hero.",
    isActive: true,
    isPremium: false,
    config: {
      primaryColor: "#a16207",
      fontFamily: "Playfair Display",
      showGitHubStats: true,
      showTechStack: true,
    },
  },
  // Phase 7 — three new archetypes covering research, systems, and
  // editorial-leaning portfolios.
  {
    id: "research",
    name: "Research",
    description:
      "Academic, single-column, content-first. Modeled after researcher home pages (Karpathy, colah). Optimal for ML researchers, PhD candidates, scientists.",
    isActive: true,
    isPremium: false,
    config: {
      primaryColor: "#0066cc",
      fontFamily: "Crimson Pro",
      showGitHubStats: true,
      showTechStack: true,
      audience: ["research", "ml", "academic"],
    },
  },
  {
    id: "terminal",
    name: "Terminal",
    description:
      "CLI / hacker aesthetic — monospace, dark Monokai-ish palette, command-style headers. Optimal for SRE, DevOps, and systems / infra engineers.",
    isActive: true,
    isPremium: false,
    config: {
      primaryColor: "#a6e22e",
      fontFamily: "JetBrains Mono",
      showGitHubStats: true,
      showTechStack: true,
      audience: ["sre", "devops", "systems", "infra"],
    },
  },
  {
    id: "editorial",
    name: "Editorial",
    description:
      "Typography-forward, magazine-leaning. Display face for hero, numbered case-study project list, warm cream + vermillion accent. Optimal for senior engineers, technical leaders, and designer-developer hybrids.",
    isActive: true,
    isPremium: false,
    config: {
      primaryColor: "#ff3c00",
      fontFamily: "Fraunces",
      showGitHubStats: true,
      showTechStack: true,
      audience: ["leader", "designer-dev", "writing"],
    },
  },
];

async function main() {
  // Dynamic imports after env is loaded so `db` picks up DATABASE_URL.
  const { db } = await import("../src/lib/db");
  const { templates } = await import("../src/lib/db/schema");

  console.log("Seeding templates...");
  for (const t of shippedTemplates) {
    await db
      .insert(templates)
      .values(t)
      .onConflictDoUpdate({
        target: templates.id,
        set: {
          name: t.name,
          description: t.description,
          isActive: t.isActive,
          isPremium: t.isPremium,
          config: t.config,
        },
      });
    console.log(`  ✔ ${t.id} (${t.name})`);
  }
  console.log("Done.");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .then(() => process.exit(0));
