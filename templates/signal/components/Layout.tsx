import React from "react";
import type { ProfileData } from "@/templates/_shared/types";
import { buildAnalyticsSnippet } from "@/templates/_shared/analytics-snippet";
import { buildChatbotSnippet } from "@/templates/_shared/chatbot-snippet";
import { SignalRail } from "./SignalRail";

interface LayoutProps {
  profileData: ProfileData;
  currentPage: string;
  children: React.ReactNode;
  cssContent: string;
}

/**
 * Signal template Layout — pinned rail on the left (name + positioning +
 * nav + socials), scrolling work column on the right. Theme defaults to
 * dark; the inline bootstrap reads `prefers-color-scheme` and a saved
 * `localStorage.signal-theme` before first paint so there's no flash.
 *
 * The rail collapses to a stacked header at ≤900px; identical content,
 * same DOM order, no JS switch required — pure CSS grid reflow.
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
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />

        <style dangerouslySetInnerHTML={{ __html: cssContent }} />
        {/* Pre-paint theme restore — avoids the dark→light flash for users
            who previously chose light. Runs synchronously before any
            body paint. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('signal-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <button
          type="button"
          className="theme-toggle"
          aria-label="Toggle theme"
          data-signal-theme-toggle
        >
          <span aria-hidden="true">◐</span>
        </button>

        <div className="shell">
          <aside className="rail">
            <SignalRail basics={basics} currentPage={currentPage} />
          </aside>
          <main className="content">{children}</main>
        </div>

        {/* Theme toggle enhancement — small enough to inline, no build
            needed. No-ops when JS is off; the theme-toggle button still
            renders but does nothing (user stays in the default dark). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var b=document.querySelector('[data-signal-theme-toggle]');if(!b)return;b.addEventListener('click',function(){var h=document.documentElement;var cur=h.getAttribute('data-theme')==='light'?'dark':'light';h.setAttribute('data-theme',cur);try{localStorage.setItem('signal-theme',cur);}catch(e){}});})();`,
          }}
        />

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
