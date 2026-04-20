import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getR2Config } from "@/lib/storage/r2";

/**
 * GET /api/uploads/config
 *
 * Tells the client whether the upload feature is usable. The `<DemoForm>`
 * calls this on mount to decide whether to render an active "Upload file"
 * button or the disabled-with-tooltip fallback.
 *
 * Auth-gated because the button only appears for signed-in users anyway —
 * exposing the reason to unauthed visitors is noise.
 *
 * Response:
 *   { enabled: true }
 *   { enabled: false, reason: "Missing R2_BUCKET" }
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cfg = getR2Config();
  if (cfg.configured) {
    return NextResponse.json({ enabled: true });
  }
  return NextResponse.json({ enabled: false, reason: cfg.reason });
}
