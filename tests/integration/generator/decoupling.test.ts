/**
 * @jest-environment node
 *
 * Phase 8.5 — Decoupling invariant test.
 *
 * The load-bearing artifact of the decoupling audit: codifies the
 * "published portfolio runs standalone" rule as an automated assertion.
 *
 * We operate on the *source* of every template's Layout.tsx + ProjectCard
 * .tsx + ContactSection.tsx, plus `profile-data.ts`. Invoking
 * `renderTemplate` end-to-end under jest is blocked by a moduleNameMapper
 * vs tsconfig-paths interaction with the Next.js swc transformer
 * (templates' internal `@/templates/*` imports resolve to the wrong
 * path). Source inspection covers the same regressions — any new
 * cross-origin `<script src>`, `<form action>`, or runtime URL has to
 * land in one of these files, and we catch it here.
 *
 * The runtime behavior (inline bootstrap actually mounts, analytics
 * actually swallows 500s, etc.) is verified by the sibling unit tests:
 *   - tests/unit/templates/analytics-offline.test.ts
 *   - tests/unit/generator/og-bake.test.ts
 */

import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../..");

const TEMPLATES = ["classic", "minimal", "research", "terminal", "editorial"];

function readFile(relative: string): string {
  return readFileSync(path.join(ROOT, relative), "utf-8");
}

describe("Phase 8.5 — published portfolio is standalone", () => {
  describe("profile-data.ts", () => {
    const src = readFile("src/lib/generator/profile-data.ts");

    it("baked og.png path is a relative '/og.png' (no cross-origin OG URL)", () => {
      // The builder's /api/og route still exists (used by preview/share
      // flows), but `buildOgImageUrl` must no longer return it for
      // generated portfolios. Relative path only.
      expect(src).toMatch(/return\s+"\/og\.png"/);
      expect(src).not.toMatch(/\/api\/og\?portfolioId=/);
    });

    it("chatbot config exposes appOrigin (used by the inline bootstrap)", () => {
      expect(src).toMatch(/appOrigin:\s*appUrl/);
    });
  });

  for (const templateId of TEMPLATES) {
    describe(`template: ${templateId}`, () => {
      const layoutPath = `templates/${templateId}/components/Layout.tsx`;
      const contactPath = `templates/${templateId}/components/ContactSection.tsx`;
      const projectCardPath = `templates/${templateId}/components/ProjectCard.tsx`;

      const layout = readFile(layoutPath);
      const contact = readFile(contactPath);
      const projectCard = readFile(projectCardPath);

      it("(1) Layout has no cross-origin <script src={...}>", () => {
        // The Phase-5 shape `<script src={chatbot.apiEndpoint}>` is
        // banned; it's been replaced by the inline snippet. Static
        // `src=` attributes on non-script tags (e.g. <iframe>) are
        // separately handled.
        // Matches any `<script ... src=` pattern regardless of how the
        // URL is constructed; relaxed to allow commented-out occurrences
        // only in the deprecated `public/chatbot-embed.js` file (not
        // tested here).
        expect(layout).not.toMatch(/<script[^>]*\bsrc=\{/);
        expect(layout).not.toMatch(/<script[^>]*\bsrc="http/);
      });

      it("(2) Layout inlines the chatbot bootstrap via buildChatbotSnippet", () => {
        expect(layout).toMatch(/buildChatbotSnippet\(/);
        // Must use dangerouslySetInnerHTML (the only way to inline JS)
        // rather than a cross-origin script tag.
        expect(layout).toMatch(
          /dangerouslySetInnerHTML=\{\s*\{\s*__html:\s*buildChatbotSnippet/
        );
      });

      it("(2b) Layout does not reference the legacy apiEndpoint field", () => {
        // chatbot.apiEndpoint is kept in types.ts for backward-compat
        // but no new template may read it. The inline snippet uses
        // appOrigin + portfolioId exclusively.
        expect(layout).not.toMatch(/chatbot\.apiEndpoint/);
      });

      it("(3) ContactSection only emits mailto: links (no <form action>)", () => {
        expect(contact).toMatch(/mailto:/);
        expect(contact).not.toMatch(/<form[^>]*\baction=/);
      });

      it("(4) og:image meta comes from meta.ogImageUrl (which is /og.png)", () => {
        // The template reads `meta.ogImageUrl` and falls back to
        // `basics.avatar`. Profile-data.ts returns "/og.png" here, so
        // the meta tag's content is relative at render time.
        expect(layout).toMatch(
          /meta\.ogImageUrl\s*\|\|\s*basics\.avatar|meta\.ogImageUrl\s*\?\?\s*basics\.avatar/
        );
      });

      it("(5) no <link rel='stylesheet' href='http…'> in the Layout", () => {
        // Templates inline CSS via `styles/global.css` processed by the
        // generator. A remote stylesheet would be a regression.
        expect(layout).not.toMatch(
          /<link[^>]*rel=["']stylesheet["'][^>]*href=["']https?:\/\//
        );
      });

      it("(6) ProjectCard does not hardcode a builder-origin <img src>", () => {
        // `project.screenshot` carries the image URL set by the owner;
        // it may be an R2 URL or GitHub avatar (both allowed by the
        // runtime decoupling audit). A builder-origin hardcoded URL
        // would be a bug.
        expect(projectCard).not.toMatch(
          /<img[^>]*src=["'][^"']*\/api\//
        );
      });
    });
  }

  describe("chatbot-snippet.ts", () => {
    const src = readFile("templates/_shared/chatbot-snippet.ts");

    it("mounts iframe with src composed from appOrigin (not a hardcoded URL)", () => {
      expect(src).toMatch(/origin\s*\+\s*"\/embed\/chatbot\/"/);
      expect(src).not.toMatch(/fetch\(["']http/);
    });

    it("handles iframe load failure by removing the widget", () => {
      // The key decoupling guarantee — if the builder is down, the
      // widget silently self-removes instead of leaving a broken UI.
      expect(src).toMatch(/addEventListener\(["']error["']/);
    });

    it("is a no-op when portfolioId is missing", () => {
      // Phase 9 split the guards — portfolioId is always required, but
      // appOrigin is only required when `selfHosted` is false. Assert
      // both guards exist independently.
      expect(src).toMatch(
        /if\s*\(\s*!options\.portfolioId\s*\)\s*return\s+["']["']/
      );
    });

    it("is a no-op when not self-hosted and appOrigin is missing", () => {
      expect(src).toMatch(
        /if\s*\(\s*!selfHosted\s*&&\s*!options\.appOrigin\s*\)\s*return\s+["']["']/
      );
    });
  });

  describe("Phase 9 — self-hosted chatbot shape", () => {
    it("chatbot-snippet.ts emits a same-origin iframe when selfHosted is true", () => {
      const src = readFile("templates/_shared/chatbot-snippet.ts");
      // The self-hosted branch points the iframe at `/chat.html` (no
      // appOrigin concatenation). Any future regression that
      // reintroduces cross-origin loading would break this match.
      expect(src).toMatch(/f\.src\s*=\s*["']\/chat\.html["']/);
    });

    it("functions/api/chat/stream.ts uses the shared retrieve/prompt/stream ports", () => {
      const src = readFile("functions/api/chat/stream.ts");
      expect(src).toMatch(/from\s+["']\.\.\/\.\.\/_shared\/retrieve["']/);
      expect(src).toMatch(/from\s+["']\.\.\/\.\.\/_shared\/prompt["']/);
      expect(src).toMatch(/from\s+["']\.\.\/\.\.\/_shared\/stream["']/);
      expect(src).toMatch(/from\s+["']\.\.\/\.\.\/_shared\/workers-ai["']/);
    });

    it("Pages Function hits no cross-origin URL (no fetch with absolute http)", () => {
      for (const path of [
        "functions/api/chat/stream.ts",
        "functions/api/chat/message.ts",
      ]) {
        const src = readFile(path);
        // The Function uses the `env.AI` binding — no `fetch("https://...")`
        // to any external service.
        expect(src).not.toMatch(/fetch\(["']https?:\/\//);
      }
    });

    it("public/chat-embed/chat.js POSTs to same-origin /api/chat/stream only", () => {
      const src = readFile("public/chat-embed/chat.js");
      expect(src).toMatch(/fetch\(["']\/api\/chat\/stream["']/);
      // No absolute URLs to the builder or any other origin.
      expect(src).not.toMatch(/fetch\(["']https?:\/\//);
    });
  });
});
