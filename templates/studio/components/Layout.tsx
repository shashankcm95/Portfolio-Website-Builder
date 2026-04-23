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

function hireStatusLabel(
  hiring: ProfileData["basics"]["hiring"]
): string | null {
  if (!hiring) return null;
  if (hiring.status === "available") return "Available for new work";
  if (hiring.status === "open") return "Open to opportunities";
  return null;
}

/**
 * Studio template Layout — light, asymmetric, with a sticky top bar
 * that includes the hire-status chip. The chip is the lodestar of the
 * whole template: visitors always see availability in context, not
 * buried on the contact page.
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
  const statusLabel = hireStatusLabel(basics.hiring);

  const navLinks = [
    { href: "/", label: "Home", id: "home" },
    { href: "/projects/", label: "Work", id: "projects" },
    { href: "/about/", label: "About", id: "about" },
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
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,500&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />

        <style dangerouslySetInnerHTML={{ __html: cssContent }} />
      </head>
      <body>
        <header className="topbar">
          <div className="container topbar-inner">
            <div className="brand">
              <a href="/">{basics.name}</a>
            </div>
            <nav aria-label="Primary">
              <ul className="nav-links">
                {navLinks.map((n) => (
                  <li key={n.id}>
                    <a
                      href={n.href}
                      className={currentPage === n.id ? "active" : undefined}
                    >
                      {n.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            {statusLabel ? (
              <span className="status-chip">{statusLabel}</span>
            ) : (
              <span className="status-chip is-not-looking">
                {basics.location?.city || basics.location?.country || "Studio"}
              </span>
            )}
          </div>
        </header>

        <main>{children}</main>

        <footer className="footer">
          <div className="container footer-inner">
            <span>
              © {new Date().getFullYear()} {basics.name}
            </span>
            <span>
              {basics.profiles.map((p, i) => (
                <React.Fragment key={p.network}>
                  {i > 0 && " · "}
                  <a href={p.url} target="_blank" rel="noopener noreferrer">
                    {p.network}
                  </a>
                </React.Fragment>
              ))}
            </span>
          </div>
        </footer>

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
