/**
 * Phase 5 — Embed iframe layout. Strips the root layout's chrome so the
 * chatbot panel bleeds seamlessly into the host page.
 *
 * Next.js App Router only allows ONE root `<html>/<body>` (the outer
 * `src/app/layout.tsx`). The body has `bg-background` applied via
 * `globals.css`, so the iframe would otherwise paint an opaque rectangle
 * over the host page even when the launcher is closed. We solve that
 * by injecting a route-scoped `<style>` tag that resets body styling
 * for this nested layout only.
 */

export const metadata = {
  title: "Portfolio chatbot",
  robots: { index: false, follow: false },
};

export default function EmbedChatbotLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Route-scoped reset. The `#embed-chatbot-root` wrapper lets us
          scope any future overrides without affecting other pages that
          happen to render inside the same root layout during dev. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            html, body { background: transparent !important; margin: 0 !important; padding: 0 !important; height: 100%; }
            body { overflow: hidden; }
          `,
        }}
      />
      <div id="embed-chatbot-root" className="h-full w-full">
        {children}
      </div>
    </>
  );
}
