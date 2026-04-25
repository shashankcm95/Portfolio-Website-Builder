import { execFile } from "child_process";
import { promisify } from "util";
import { logger } from "@/lib/log";

const exec = promisify(execFile);

export interface DeployResult {
  success: boolean;
  url?: string;
  deploymentId?: string;
  error?: string;
}

/**
 * Phase R7 — Ensure the Pages project exists before deploying.
 *
 * `wrangler pages deploy --project-name X` requires X to already exist.
 * On first publish for a portfolio, it doesn't, and wrangler returns a
 * 7003 "Could not route" error that's hard to diagnose. We pre-create
 * the project (idempotently — exit code != 0 with stdout containing
 * "already exists" is treated as success). The build target stays on
 * `production` so Pages serves the deployment at the canonical
 * `<project>.pages.dev` host.
 */
async function ensureProjectExists(projectName: string): Promise<{
  ok: boolean;
  alreadyExisted: boolean;
  error?: string;
}> {
  try {
    await exec(
      "npx",
      [
        "wrangler",
        "pages",
        "project",
        "create",
        projectName,
        "--production-branch",
        "main",
      ],
      {
        env: {
          ...process.env,
          CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
          CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
        },
        timeout: 60000,
      }
    );
    logger.info("[deployer/cloudflare] created Pages project", { projectName });
    return { ok: true, alreadyExisted: false };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    // Wrangler's "project already exists" error path is friendly to
    // string-match — both stdout and stderr include the literal phrase.
    // We tolerate it because re-running deploy on an existing project
    // is the common path.
    if (
      /already exists/i.test(message) ||
      /code:\s*8000007/i.test(message) // CF API "duplicate name"
    ) {
      return { ok: true, alreadyExisted: true };
    }
    logger.error("[deployer/cloudflare] project create failed", {
      projectName,
      error: message,
    });
    return { ok: false, alreadyExisted: false, error: message };
  }
}

/**
 * Deploy a directory of static files to Cloudflare Pages using wrangler.
 */
export async function deployToCloudflare(
  outputDir: string,
  projectName: string
): Promise<DeployResult> {
  // Phase R7 — auto-create the Pages project on first deploy. Idempotent
  // for subsequent deploys (existing-project path is treated as success).
  const ensured = await ensureProjectExists(projectName);
  if (!ensured.ok) {
    return {
      success: false,
      error: `Failed to create Pages project "${projectName}": ${
        ensured.error ?? "unknown error"
      }. Verify your CLOUDFLARE_API_TOKEN has the Cloudflare Pages: Edit permission for this account.`,
    };
  }

  try {
    const { stdout, stderr: _stderr } = await exec(
      "npx",
      [
        "wrangler",
        "pages",
        "deploy",
        outputDir,
        "--project-name",
        projectName,
        // Phase R7 — pin the deploy to the production branch so
        // wrangler doesn't prompt interactively (the prompt fails in
        // server context). Pages projects we create above default to
        // `main` as the production branch.
        "--branch",
        "main",
      ],
      {
        env: {
          ...process.env,
          CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
          CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
        },
        timeout: 120000,
      }
    );

    // Extract URL from wrangler output
    const urlMatch = stdout.match(/https:\/\/[^\s]+\.pages\.dev/);
    const idMatch = stdout.match(/Deployment ID: ([a-f0-9-]+)/i);

    logger.info("[deployer/cloudflare] deploy succeeded", {
      projectName,
      url: urlMatch?.[0],
      deploymentId: idMatch?.[1],
      projectAutoCreated: !ensured.alreadyExisted,
    });

    return {
      success: true,
      url: urlMatch?.[0],
      deploymentId: idMatch?.[1],
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Deployment failed";
    logger.error("[deployer/cloudflare] deploy failed", {
      projectName,
      error: message,
    });
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Generate a Cloudflare Pages project name from userId and portfolio slug.
 * Cloudflare project names must be lowercase alphanumeric + hyphens.
 */
export function generateProjectName(userId: string, slug: string): string {
  return `pf-${userId.substring(0, 8)}-${slug}`;
}
