import React from "react";
import fs from "fs";
import path from "path";
import type { ProfileData } from "@/templates/_shared/types";
import { buildAnalyticsSnippet } from "@/templates/_shared/analytics-snippet";
import { buildChatbotSnippet } from "@/templates/_shared/chatbot-snippet";

// Read the enhance.js bootstrap at module-load time (SSR only).
// Inlining avoids an extra HTTP request; the file is ≤5 KB per the budget.
const enhanceScript = (() => {
  try {
    return fs.readFileSync(
      path.join(process.cwd(), "templates", "kinetic", "scripts", "enhance.js"),
      "utf-8"
    );
  } catch {
    return "";
  }
})();

interface LayoutProps {
  profileData: ProfileData;
  currentPage: string;
  children: React.ReactNode;
  cssContent: string;
}

/**
 * Kinetic template — cinematic / motion-rich layout.
 *
 * Floating-pill nav (§2.6) is fixed at top-center. Theme defaults to
 * dark; an inline pre-paint script reads `localStorage.kinetic-theme`
 * before any body paint to avoid the dark→light flash for users who
 * picked light last visit.
 *
 * The hero gradient backdrop (CSS-animated) sits inside the hero
 * section itself. When `basics.heroVideoUrl` is added in a later phase,
 * the Hero component swaps it for a real <video> + the §2.4 rAF fade
 * loop — no Layout change required.
 */
export function Layout({
  profileData,
  currentPage,
  children,
  cssContent,
}: LayoutProps) {
  const { basics, meta, chatbot } = profileData;
  const title = `${basics.name} — ${basics.positioning ?? basics.label}`;
  const description = (basics.summary ?? "").substring(0, 160);
  const siteUrl = meta.siteUrl || "";
  const ogImage = meta.ogImageUrl || basics.avatar;

  const navItems: { href: string; label: string; key: string }[] = [
    { href: "/", label: "Work", key: "home" },
    { href: "/about/", label: "About", key: "about" },
    { href: "/projects/", label: "Index", key: "projects" },
    { href: "/contact/", label: "Contact", key: "contact" },
  ];

  return (
    <html lang="en" data-theme="dark">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="author" content={basics.name} />
        {siteUrl && <link rel="canonical" href={siteUrl} />}

        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
        {siteUrl && <meta property="og:url" content={siteUrl} />}
        {ogImage && <meta property="og:image" content={ogImage} />}
        {ogImage && <meta property="og:image:width" content="1200" />}
        {ogImage && <meta property="og:image:height" content="630" />}
        {ogImage && (
          <meta property="og:image:alt" content={`${basics.name} — portfolio`} />
        )}
        <meta
          name="twitter:card"
          content={ogImage ? "summary_large_image" : "summary"}
        />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        {ogImage && <meta name="twitter:image" content={ogImage} />}

        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Instrument+Serif:ital@0;1&family=Geist+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />

        <style dangerouslySetInnerHTML={{ __html: cssContent }} />

        {/* §2.12 pre-paint theme restore — avoids the dark→light flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('kinetic-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <div className="kinetic-shell">
          {/* §2.6 floating-pill nav, fixed at top-center */}
          <nav
            className="kinetic-nav liquid-glass"
            aria-label="Primary navigation"
          >
            <a href="/" className="kinetic-nav-brand">
              {basics.name.split(" ")[0].toLowerCase()}
              <em>·</em>
            </a>
            <div className="kinetic-nav-links">
              {navItems.map((item) => (
                <a
                  key={item.key}
                  href={item.href}
                  className={`kinetic-nav-link ${
                    currentPage === item.key ? "active" : ""
                  }`}
                >
                  {item.label}
                </a>
              ))}
            </div>
            {basics.hiring?.status === "available" && (
              <a
                href={basics.hiring.ctaHref || "/contact/"}
                className="kinetic-nav-cta"
              >
                {basics.hiring.ctaText || "Hire me"}
              </a>
            )}
          </nav>

          {currentPage === "home" ? (
            children
          ) : (
            <main className="kinetic-main">{children}</main>
          )}

          <footer className="kinetic-footer">
            <span>
              © {new Date().getFullYear()} {basics.name}
            </span>
            <span>Built kinetic — proof-backed portfolio</span>
          </footer>
        </div>

        {/* §2.12 theme toggle — visible always, click handler in enhance.js */}
        <button
          type="button"
          className="kinetic-theme-toggle"
          aria-label="Toggle theme"
          data-kinetic-theme-toggle
        >
          <span aria-hidden="true">◐</span>
        </button>

        {chatbot?.enabled &&
          chatbot.portfolioId &&
          (chatbot.selfHosted || chatbot.appOrigin) && (
            <script
              dangerouslySetInnerHTML={{
                __html: buildChatbotSnippet({
                  appOrigin: chatbot.appOrigin,
                  portfolioId: chatbot.portfolioId,
                  selfHosted: chatbot.selfHosted,
                }),
              }}
            />
          )}

        {meta.analyticsEndpoint && meta.analyticsPortfolioId && (
          <script
            dangerouslySetInnerHTML={{
              __html: buildAnalyticsSnippet({
                apiUrl: meta.analyticsEndpoint,
                portfolioId: meta.analyticsPortfolioId,
              }),
            }}
          />
        )}

        {/* enhance.js — magnetic hover + theme toggle wire + BlurText IO */}
        {enhanceScript && (
          <script dangerouslySetInnerHTML={{ __html: enhanceScript }} />
        )}
      </body>
    </html>
  );
}
