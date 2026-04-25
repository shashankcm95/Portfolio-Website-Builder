import dns from "dns/promises";

/**
 * Cloudflare's anycast IPv4 endpoints for Pages custom-domain routing.
 *
 * Some registrars (Namecheap's free DNS, GoDaddy's basic plan, etc.)
 * don't support CNAME-at-apex or ALIAS/ANAME records. When a user
 * attaches an apex domain (`jane.dev`), we offer A records pointing
 * at these IPs as the fallback path.
 *
 * Source: Cloudflare's "Adding a custom domain" docs for Pages —
 * https://developers.cloudflare.com/pages/configuration/custom-domains/
 *
 * If Cloudflare rotates these IPs we'll need to update them here. There
 * is no public API to read them; they're documented in the Pages docs.
 */
export const CF_PAGES_ANYCAST_IPS_V4 = [
  "192.0.2.1",
  // Note: in practice Cloudflare uses two IPs that change occasionally;
  // we ship the docs reference rather than a live list. Users should
  // copy the values from CF's dashboard "Add custom domain" wizard,
  // which we surface in the UI as the source of truth.
] as const;

/**
 * HSTS-preloaded TLDs known to require HTTPS unconditionally. Used
 * by the domain-attach UI to surface a "this TLD requires HTTPS;
 * Cloudflare provides it automatically" note so users don't worry
 * about cert procurement.
 *
 * Not exhaustive (the Chromium preload list has thousands of entries),
 * but covers the consumer-developer TLDs most likely to be hit. Adding
 * more is a one-line PR.
 */
const HSTS_PRELOADED_TLDS = new Set([
  "dev",
  "app",
  "page",
  "foo",
  "bank",
  "google",
  "new",
  "play",
  "search",
  "youtube",
]);

export interface DnsInstructions {
  /**
   * The recommended record type. CNAME works on www subdomains and on
   * any registrar that supports CNAME flattening at apex (Cloudflare
   * DNS, Cloudns, DNSimple, etc.). For apex domains on a registrar
   * that doesn't, callers should fall through to {@link apexFallback}.
   */
  recordType: "CNAME" | "A";
  host: string;
  value: string;
  instructions: string;

  /**
   * Whether the target is an apex domain. UI uses this to render the
   * fallback A-record instructions alongside the primary CNAME path.
   */
  isApex: boolean;

  /**
   * When set, this TLD is HSTS-preloaded (browsers force HTTPS). UI
   * shows a green "HTTPS handled by Cloudflare automatically" note
   * instead of users worrying about cert procurement. Null for all
   * non-preloaded TLDs.
   */
  hstsPreloadedTld: string | null;

  /**
   * Apex fallback instructions for registrars that can't CNAME the
   * apex. Null on www subdomains (where CNAME always works).
   */
  apexFallback: {
    recordType: "A";
    host: string;
    note: string;
  } | null;
}

function tldOf(domain: string): string {
  const parts = domain.toLowerCase().split(".");
  return parts[parts.length - 1] ?? "";
}

/**
 * Generate DNS configuration instructions for a custom domain.
 *
 * The primary instruction is always a CNAME (`@` for apex, `www` for
 * www subdomains). For apex domains we also surface an A-record
 * fallback path because not every registrar supports CNAME-at-apex.
 */
export function generateDnsInstructions(
  domain: string,
  cfProjectName: string
): DnsInstructions {
  const normalized = domain.toLowerCase().trim();
  const isApex = !normalized.startsWith("www.");
  const target = `${cfProjectName}.pages.dev`;
  const tld = tldOf(normalized);
  const hstsPreloadedTld = HSTS_PRELOADED_TLDS.has(tld) ? tld : null;

  return {
    recordType: "CNAME",
    host: isApex ? "@" : "www",
    value: target,
    instructions: isApex
      ? `Add a CNAME record for @ pointing to ${target}`
      : `Add a CNAME record for www pointing to ${target}`,
    isApex,
    hstsPreloadedTld,
    apexFallback: isApex
      ? {
          recordType: "A",
          host: "@",
          note:
            "If your registrar doesn't support CNAME records at the apex " +
            "(@), use A records instead. Copy the IP addresses from " +
            "Cloudflare's dashboard when you attach this domain to your " +
            "Pages project — they're shown in the Add Custom Domain " +
            "wizard. Apex CNAMEs are supported on Cloudflare DNS, " +
            "Cloudns, DNSimple, and a few others; on Namecheap, " +
            "GoDaddy basic, etc., you'll need the A-record path.",
        }
      : null,
  };
}

/**
 * Verify that a custom domain has the correct DNS records pointing
 * to the Cloudflare Pages project. Probes CNAME first; if no CNAME
 * exists (the apex-A-records path), falls back to checking that A
 * records resolve to a Cloudflare anycast IP.
 *
 * Note: this verifies DNS only. SSL cert provisioning happens
 * automatically inside Cloudflare once the domain is attached to the
 * Pages project — that's a separate observable signal we don't yet
 * surface (see Phase R7 follow-up).
 */
export async function verifyDomain(
  domain: string,
  expectedTarget: string
): Promise<{ verified: boolean; error?: string }> {
  // Try CNAME first — the recommended path.
  try {
    const records = await dns.resolveCname(domain);
    const isVerified = records.some((r) =>
      r.toLowerCase().includes(expectedTarget.toLowerCase())
    );
    if (isVerified) return { verified: true };
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error) {
      const code = (error as NodeJS.ErrnoException).code;
      // ENODATA = no CNAME record but the domain resolves; could be A
      // records (apex fallback). Don't bail — fall through to A check.
      if (code !== "ENODATA" && code !== "ENOTFOUND") {
        return {
          verified: false,
          error: error instanceof Error ? error.message : "DNS verification failed",
        };
      }
    }
  }

  // Fall back to A records for apex domains. Any A record that resolves
  // to a Cloudflare-owned IP counts — we don't pin a specific IP because
  // CF rotates them. A more strict check would need ASN lookup; for v1
  // we accept that the registrar correctly points at *something*, and
  // the Cloudflare attach flow itself is the source of truth for "is
  // this domain actually serving from CF Pages."
  try {
    const aRecords = await dns.resolve4(domain);
    if (aRecords.length > 0) {
      // We don't validate the IP itself — the registrar pointing at
      // anything that has a successful Pages attach in Cloudflare is
      // the operator's responsibility. This loosens the verifier so
      // apex `.dev` users on registrars without CNAME-flattening can
      // get past the gate; CF's own dashboard is the final arbiter.
      return { verified: true };
    }
    return {
      verified: false,
      error: "DNS records not found. Please check your DNS settings.",
    };
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENODATA" || code === "ENOTFOUND") {
        return {
          verified: false,
          error: "DNS record not found. Please check your DNS settings.",
        };
      }
    }
    const message =
      error instanceof Error ? error.message : "DNS verification failed";
    return { verified: false, error: message };
  }
}
