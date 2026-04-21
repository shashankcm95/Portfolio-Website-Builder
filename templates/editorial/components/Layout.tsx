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
 * Phase 7 — Editorial template Layout.
 *
 * Loads Inter (body) + Fraunces (display, variable axis) from Google
 * Fonts. Falls back to system serif/sans on offline. Same head /
 * chatbot / analytics blocks as siblings.
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
  const ogImage = meta.ogImageUrl || basics.avatar;

  const navLinks = [
    { href: "/", label: "Index", id: "home" },
    { href: "/about/", label: "About", id: "about" },
    { href: "/projects/", label: "Work", id: "projects" },
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
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,500&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />

        <style dangerouslySetInnerHTML={{ __html: cssContent }} />
      </head>
      <body>
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

        <main>{children}</main>

        <footer className="footer">
          <div className="footer-inner">
            <span>© {new Date().getFullYear()} {basics.name}</span>
            <span>
              {basics.profiles.map((p, i) => (
                <React.Fragment key={p.network}>
                  {i > 0 && " / "}
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {p.network}
                  </a>
                </React.Fragment>
              ))}
            </span>
          </div>
        </footer>

        {/* Phase 5 / 8.5 / 9 — inline chatbot bootstrap; see classic Layout. */}
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
      </body>
    </html>
  );
}
