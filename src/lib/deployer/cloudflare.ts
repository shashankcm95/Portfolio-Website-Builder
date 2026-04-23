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
 * Deploy a directory of static files to Cloudflare Pages using wrangler.
 */
export async function deployToCloudflare(
  outputDir: string,
  projectName: string
): Promise<DeployResult> {
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
