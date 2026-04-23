import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

/**
 * Phase R5b — Request id propagation.
 *
 * Middleware runs on the Edge runtime, where Node's `AsyncLocalStorage`
 * is not available. We therefore can't wrap downstream handlers in
 * `runWithRequestId` from here. Instead we:
 *   1. Generate a request id per incoming request (`crypto.randomUUID`,
 *      available in Edge).
 *   2. Stamp it onto the *request* headers so any Node-runtime API route
 *      can read `x-request-id` and — if it cares — wrap its handler in
 *      `runWithRequestId` to auto-tag downstream logs.
 *   3. Echo the id back on the *response* so clients and log pipelines
 *      can correlate.
 *
 * This keeps Edge compatibility intact while still giving Node handlers
 * a correlation id they can opt into.
 */

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const isPublicRoute = ["/", "/sign-in", "/sign-out"].includes(req.nextUrl.pathname) ||
    req.nextUrl.pathname.startsWith("/api/auth") ||
    req.nextUrl.pathname.startsWith("/api/chatbot") ||
    // Phase 5: the iframe page + its static bootstrap script are public.
    req.nextUrl.pathname.startsWith("/embed/chatbot") ||
    req.nextUrl.pathname === "/chatbot-embed.js" ||
    // Phase 6: share-link previews are public (auth replaced by token).
    req.nextUrl.pathname.startsWith("/share/") ||
    // Phase 6: public analytics beacon for pageviews on published sites.
    req.nextUrl.pathname === "/api/events/track" ||
    // Phase 6: dynamic OG image endpoint (bots hit this without auth).
    req.nextUrl.pathname.startsWith("/api/og")

  if (!isLoggedIn && !isPublicRoute) {
    return NextResponse.redirect(new URL("/sign-in", req.nextUrl.origin))
  }

  if (isLoggedIn && req.nextUrl.pathname === "/sign-in") {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl.origin))
  }

  // Phase R5b — request id. Use an inbound header if a trusted upstream
  // (e.g. Cloudflare) already supplied one; otherwise mint a fresh v4.
  const incoming = req.headers.get("x-request-id")
  const reqId = incoming && incoming.length > 0 && incoming.length <= 200
    ? incoming
    : crypto.randomUUID()

  const requestHeaders = new Headers(req.headers)
  requestHeaders.set("x-request-id", reqId)

  const res = NextResponse.next({
    request: { headers: requestHeaders },
  })
  res.headers.set("x-request-id", reqId)
  return res
})

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
}
