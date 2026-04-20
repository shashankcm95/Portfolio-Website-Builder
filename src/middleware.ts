import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

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
})

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
}
