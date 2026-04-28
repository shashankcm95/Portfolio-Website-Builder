/**
 * Phase E8e — Provision the Workers AI binding on a Cloudflare Pages
 * project via the CF REST API.
 *
 * Why we need this in addition to `wrangler.toml`: the toml-based
 * binding declaration only works when `pages_build_output_dir` is set,
 * AND only takes effect on a fresh Pages deploy (not a project that
 * was created with no bindings). Calling the API directly is
 * deterministic — the binding lands on the project, every subsequent
 * deploy inherits it.
 *
 * Idempotent: re-calling on a project that already has the binding
 * returns 200 with the same configuration.
 */

import { logger } from "@/lib/log";

const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN ?? "";
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";

export interface ProvisionAiBindingResult {
  ok: boolean;
  /**
   * Set when the call did not succeed but we don't want to abort the
   * deploy. The chatbot can be reconfigured manually via the dashboard
   * if this hook fails — the deploy itself still produces a working
   * static site.
   */
  reason?: string;
}

/**
 * Patch the Pages project's `deployment_configs.production.ai_bindings`
 * to register `AI` against Workers AI. Future deploys to this project
 * will run with `env.AI` populated; existing live deploys do NOT
 * pick up the change (Cloudflare scopes bindings to a deployment at
 * create time).
 */
export async function provisionAiBinding(
  projectName: string
): Promise<ProvisionAiBindingResult> {
  if (!CF_API_TOKEN || !CF_ACCOUNT_ID) {
    return {
      ok: false,
      reason:
        "CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID not set; cannot provision Workers AI binding.",
    };
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects/${projectName}`;
  try {
    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        deployment_configs: {
          production: {
            ai_bindings: {
              // Cloudflare's API expects an empty object as the binding
              // payload — the binding name is the key. The runtime
              // binding identifier (`env.AI`) matches the JSON key.
              AI: {},
            },
          },
          preview: {
            ai_bindings: {
              AI: {},
            },
          },
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.warn("[cf-pages-bindings] AI binding provisioning failed", {
        projectName,
        status: res.status,
        body: body.slice(0, 400),
      });
      return {
        ok: false,
        reason: `Cloudflare API rejected the binding update (${res.status}). Token may need 'Cloudflare Pages: Edit' scope.`,
      };
    }

    logger.info("[cf-pages-bindings] AI binding provisioned", { projectName });
    return { ok: true };
  } catch (err) {
    logger.warn("[cf-pages-bindings] AI binding hook crashed", {
      projectName,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      reason:
        err instanceof Error
          ? err.message
          : "Network error while provisioning Workers AI binding",
    };
  }
}
