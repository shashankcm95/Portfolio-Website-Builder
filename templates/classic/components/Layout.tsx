import React from "react";
import type { ProfileData } from "@/templates/_shared/types";
import { buildAnalyticsSnippet } from "@/templates/_shared/analytics-snippet";
import { buildChatbotSnippet } from "@/templates/_shared/chatbot-snippet";

interface LayoutProps {
  profileData: ProfileData;
  currentPage: string;
  children: React.ReactNode;
  cssContent: string;
}

/**
 * Full HTML page layout for the generated static site.
 * Renders a complete <!DOCTYPE html> document with head, nav, main, and footer.
 */
export function Layout({
  profileData,
  currentPage,
  children,
  cssContent,
}: LayoutProps) {
  const { basics, meta, chatbot } = profileData;
  const title = `${basics.name} — ${basics.label}`;
  const description = basics.summary.substring(0, 160);
  const siteUrl = meta.siteUrl || "";
  // Phase 6 — dynamic OG image preferred; fall back to the owner's
  // avatar so the published site still unfurls in social previews.
  const ogImage = meta.ogImageUrl || basics.avatar;

  const navLinks = [
    { href: "/", label: "Home", id: "home" },
    { href: "/about/", label: "About", id: "about" },
    { href: "/projects/", label: "Projects", id: "projects" },
    { href: "/contact/", label: "Contact", id: "contact" },
  ];

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="author" content={basics.name} />

        {/* Canonical */}
        {siteUrl && <link rel="canonical" href={siteUrl} />}

        {/* Open Graph */}
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
        {siteUrl && <meta property="og:url" content={siteUrl} />}
        {ogImage && <meta property="og:image" content={ogImage} />}
        {/* Phase 6 — declared dimensions + alt so scrapers index the image
            correctly. When the dynamic OG endpoint renders at 1200×630,
            these match. When falling back to the avatar, the dimensions
            are still plausible defaults for scraper preview frames. */}
        {ogImage && <meta property="og:image:width" content="1200" />}
        {ogImage && <meta property="og:image:height" content="630" />}
        {ogImage && (
          <meta property="og:image:alt" content={`${basics.name} — portfolio`} />
        )}

        {/* Twitter Card */}
        <meta
          name="twitter:card"
          content={ogImage ? "summary_large_image" : "summary"}
        />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        {ogImage && <meta name="twitter:image" content={ogImage} />}

        {/* Fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700;900&family=Source+Sans+3:wght@400;500;600&display=swap"
          rel="stylesheet"
        />

        {/* Inline CSS */}
        <style dangerouslySetInnerHTML={{ __html: cssContent }} />
      </head>
      <body>
        {/* Navigation */}
        <nav className="nav">
          <div className="nav-inner">
            <a href="/" className="nav-brand">
              {basics.name}
            </a>
            <ul className="nav-links">
              {navLinks.map((link) => (
                <li key={link.id}>
                  <a
                    href={link.href}
                    className={currentPage === link.id ? "active" : undefined}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        {/* Main Content */}
        <main>{children}</main>

        {/* Footer */}
        <footer className="footer">
          <div className="footer-inner">
            <p className="footer-text">
              &copy; {new Date().getFullYear()} {basics.name}. All rights
              reserved.
            </p>
            <ul className="footer-links">
              {basics.profiles.map((profile) => (
                <li key={profile.network}>
                  <a
                    href={profile.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {profile.network}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </footer>

        {/* Phase 5 / 8.5 / 9 — Visitor chatbot. Bootstrap is inlined
            (Phase 8.5). When `selfHosted` is true (Phase 9), the iframe
            loads `/chat.html` on this same origin, served alongside a
            Pages Function at `/api/chat/stream` — fully independent of
            the builder. When false/omitted, the iframe loads from
            `{appOrigin}/embed/chatbot/:pid` and self-removes on load
            failure if the builder is unreachable. */}
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

        {/* Phase 6 — Analytics beacon. Fire-and-forget pageview on load.
            Omitted when NEXT_PUBLIC_APP_URL isn't configured. */}
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
      </body>
    </html>
  );
}
