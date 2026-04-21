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
 * Phase 7 — Terminal template Layout.
 *
 * Renders the same head/chatbot/analytics blocks as siblings; visual
 * chrome is "shell prompt" themed via the nav bar showing `~/{slug}`
 * + path-style links. No external font deps — uses native monospace.
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
    { href: "/", label: "home", id: "home" },
    { href: "/about/", label: "about", id: "about" },
    { href: "/projects/", label: "projects", id: "projects" },
    { href: "/contact/", label: "contact", id: "contact" },
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

        <style dangerouslySetInnerHTML={{ __html: cssContent }} />
      </head>
      <body>
        <nav className="nav">
          <div className="nav-inner">
            <a href="/" className="nav-brand">
              {slugFromName(basics.name)}
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
            <span># © {new Date().getFullYear()} {basics.name}</span>
            <span>
              {basics.profiles.map((p, i) => (
                <React.Fragment key={p.network}>
                  {i > 0 && " · "}
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

function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
}
