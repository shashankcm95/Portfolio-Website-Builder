import React from "react";
import type { ProfileData } from "@/templates/_shared/types";

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
  const { basics, meta } = profileData;
  const title = `${basics.name} — ${basics.label}`;
  const description = basics.summary.substring(0, 160);
  const siteUrl = meta.siteUrl || "";

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

        {/* Open Graph */}
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
        {siteUrl && <meta property="og:url" content={siteUrl} />}
        {basics.avatar && <meta property="og:image" content={basics.avatar} />}

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        {basics.avatar && (
          <meta name="twitter:image" content={basics.avatar} />
        )}

        {/* Fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
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
      </body>
    </html>
  );
}
