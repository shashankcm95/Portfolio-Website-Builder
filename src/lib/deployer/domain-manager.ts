import dns from "dns/promises";

export interface DnsInstructions {
  recordType: "CNAME" | "A";
  host: string;
  value: string;
  instructions: string;
}

/**
 * Generate DNS configuration instructions for a custom domain.
 */
export function generateDnsInstructions(
  domain: string,
  cfProjectName: string
): DnsInstructions {
  const isApex = !domain.startsWith("www.");

  return {
    recordType: "CNAME",
    host: isApex ? "@" : "www",
    value: `${cfProjectName}.pages.dev`,
    instructions: isApex
      ? `Add a CNAME record for @ pointing to ${cfProjectName}.pages.dev`
      : `Add a CNAME record for www pointing to ${cfProjectName}.pages.dev`,
  };
}

/**
 * Verify that a custom domain has the correct DNS records pointing
 * to the Cloudflare Pages project.
 */
export async function verifyDomain(
  domain: string,
  expectedTarget: string
): Promise<{ verified: boolean; error?: string }> {
  try {
    const records = await dns.resolveCname(domain);
    const isVerified = records.some((r) =>
      r.toLowerCase().includes(expectedTarget.toLowerCase())
    );
    return { verified: isVerified };
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
