# Portfolio Website Builder

An AI-assisted builder that turns a developer's GitHub repos + resume into a
**proof-backed portfolio**: every claim on the generated site traces back to
concrete code evidence (a dependency, a workflow, a file, a grep hit) surfaced
by a verification pipeline, so the site is harder to bluff and faster to
trust.

The builder ships the full loop — ingest, analyze, narrate, verify, render,
deploy, and measure — as a single Next.js app backed by Postgres. Five
hand-authored templates cover SDE, SRE, research, leader, and
designer-developer archetypes; a layout-review agent flags wrap, contrast, and
font-size issues before you share.

---

## Tech stack

- **Runtime:** Node.js 22 (via `nvm`), Next.js 14 App Router, TypeScript
- **UI:** Tailwind CSS + Radix UI primitives
- **Database:** PostgreSQL 16 with `pgvector` (run locally via Docker Compose)
- **ORM:** Drizzle (schema + migrations in `src/lib/db/`)
- **Auth:** Auth.js v5 (NextAuth) with GitHub OAuth
- **AI providers:** Anthropic Claude (analysis + narrative) and OpenAI
  (chatbot + embeddings). Both support BYOK — users can supply their own keys
  in Settings → AI Provider.
- **Object storage:** Cloudflare R2 (S3-compatible) for uploaded assets
- **Deploy target for generated sites:** Cloudflare Pages
- **Testing:** Jest (unit + integration), Playwright (e2e + layout review)

---

## Quick start

### 1. Prerequisites

- Node.js 22 (`nvm install 22 && nvm use 22`)
- Docker Desktop (for Postgres + pgvector)
- A GitHub OAuth app (Developer Settings → OAuth Apps → New)
- At least one AI provider key:
  - Anthropic API key (recommended for analysis), and/or
  - OpenAI API key (required for chatbot + embeddings)

### 2. Clone and install

```bash
git clone <this-repo>
cd portfolio-website-builder
nvm use 22
npm install
```

### 3. Database

```bash
docker compose up -d         # Postgres + pgvector on :5432
```

The `scripts/init-db.sql` init script enables the `pgvector` extension on
first boot.

### 4. Environment

Copy the example file and fill in the required keys:

```bash
cp .env.example .env.local
```

Required for the app to boot:

| Variable | Notes |
|---|---|
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | From your GitHub OAuth app. Callback URL: `http://localhost:3000/api/auth/callback/github` |
| `DATABASE_URL` | Defaults work if you use Docker Compose |
| `ENCRYPTION_KEY` | `openssl rand -base64 32` — encrypts BYOK keys at rest |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` for local dev |

Optional:

- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` — platform defaults. If unset, every
  user must configure their own key in Settings → AI Provider.
- `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` — needed to deploy
  generated sites to Cloudflare Pages.
- `R2_*` — enables direct asset uploads in the demo editor. Any missing var
  degrades gracefully (upload button disabled with tooltip).
- `LAYOUT_REVIEW_AI_ENABLED=1` — opt-in Tier 3 (AI vision) for the layout
  review agent.

### 5. Schema + seed

```bash
npm run db:push            # apply Drizzle schema to Postgres
npm run db:seed            # seed default templates + demo rows
```

### 6. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with GitHub.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server on :3000 |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:push` | Apply schema changes directly (dev) |
| `npm run db:generate` | Generate a Drizzle migration from schema |
| `npm run db:migrate` | Apply generated migrations |
| `npm run db:studio` | Drizzle Studio browser |
| `npm run db:seed` | Idempotent seed of templates + reference rows |
| `npm test` | Jest unit + integration |
| `npm run test:watch` | Jest watch mode |
| `npm run test:e2e` | Playwright end-to-end |

---

## Templates

Five archetypes ship with the builder. Each implements the same 6-component +
5-page contract (`Layout`, `Hero`, `About`, `ProjectCard`, `ProjectDetail`,
`ContactSection`; pages `index`, `about`, `projects`, `project-detail`,
`contact`) and advertises an audience tag in `template.config.json`.

| ID | Audience | Feel |
|---|---|---|
| `minimal` | Default / neutral | Clean single-column, neutral palette |
| `classic` | SDE generalist | Editorial two-column with project grid |
| `research` | ML researchers, PhDs | Academic serif, near-black on off-white, Crimson Pro + Inter |
| `terminal` | SRE / DevOps / infra | JetBrains Mono, Monokai-ish dark palette, `$ whoami` section headers |
| `editorial` | Leaders, designer-devs | Fraunces display, cream background, vermillion accent, numbered case studies |

The template picker in Portfolio Settings shows audience chips and a
"Preview this template" link that renders any template against the current
portfolio's data without persisting.

---

## Layout review agent

Below the Preview tab, **Run layout review** triggers a three-tier check on
the generated HTML:

- **Tier 1 (static)** — runs anywhere, no browser. `cheerio` checks for
  missing `alt`, heading hierarchy, `<title>` / `<meta description>` length,
  `<html lang>`, unresolved internal links, broken analytics/chatbot URLs.
- **Tier 2 (rendered)** — runs if Playwright + Chromium are installed.
  Renders each page at 375 / 768 / 1280 viewports and checks for hero `<h1>`
  wrap (the flagship concern), horizontal overflow, body font-size, color
  contrast, touch-target size, line length, and overflow clipping.
- **Tier 3 (AI vision)** — opt-in via `LAYOUT_REVIEW_AI_ENABLED=1`.
  Screenshots each page at 1280px and asks the user's configured LLM for
  three layout/polish issues + a 0-100 score.

Playwright browsers are ~250 MB and don't fit Vercel's serverless limit. On
serverless hosts the review gracefully degrades to Tier 1 and surfaces a
message; on self-hosted / Docker / Fly / Railway it runs all tiers. Install
the browser once with:

```bash
npx playwright install chromium --with-deps
```

Reviews are advisory — they never block a deploy.

---

## Sharing a draft from localhost

The share-link page (`/share/<token>`) runs on the builder app itself, not on
the deployed Cloudflare Pages site, because it needs DB access to resolve the
token to a portfolio. That means a `localhost:3000` share link won't resolve
on anyone else's machine. The Share tab surfaces an amber warning when the
origin looks local.

**Quick tunnel for dev demos** — expose `localhost:3000` via Cloudflare
Tunnel:

```bash
# one-off, no Cloudflare account needed
cloudflared tunnel --url http://localhost:3000
```

or ngrok:

```bash
ngrok http 3000
```

Then in `.env.local`:

```bash
NEXT_PUBLIC_APP_URL=https://<your-tunnel>.trycloudflare.com
```

Restart `npm run dev`. Newly-created share links embed the tunnel URL;
existing ones keep the old origin and should be regenerated.

**Real fix for anything longer-term** — deploy the builder app to Vercel /
Fly / Railway / your own Node host, set `NEXT_PUBLIC_APP_URL` to the public
hostname, and point GitHub OAuth's callback URL at it. Share links created
after the switch use the new origin.

---

## Self-hosted chatbot (Phase 9)

By default, the published portfolio's chatbot iframe talks to the builder
app (`/api/chatbot/stream`). If you're running the builder on your
laptop and you'd like the chatbot to keep working when you're not, flip
the **"Host chatbot on the published site (recommended)"** toggle in
Portfolio Settings → Visitor chatbot.

When enabled, `npm run deploy` bakes these extra artifacts into the
Cloudflare Pages output:

- `functions/api/chat/stream.ts` — a Cloudflare Pages Function that
  embeds the visitor's query via Workers AI (BGE-base-en-v1.5), ranks
  the bundled corpus, and streams a Llama 3.1 8B response as SSE.
- `functions/_shared/embeddings.ts` — your portfolio's RAG corpus,
  pre-embedded with BGE so query + corpus share an embedding space.
  Unchanged chunks are cached by content hash and skip re-embedding on
  subsequent publishes.
- `chat.html` + `chat.js` + `chat.css` — a vanilla-JS chat widget
  served at the same origin as the portfolio (no React, no framework,
  ~10KB).
- `wrangler.toml` — declares the Workers AI binding so the Function
  can `env.AI.run(...)`.

End result: the published portfolio is fully standalone. Stop the
builder, reload the portfolio, open the chat — it still answers.

**Requirements:**
- Workers AI enabled on your Cloudflare account ([one-click in the CF
  dashboard](https://developers.cloudflare.com/workers-ai/)).
- Your `CLOUDFLARE_API_TOKEN` must include the "Workers AI" scope in
  addition to the "Pages:Edit" scope used by the basic deploy.

**Cost:**
Workers AI is billed to your Cloudflare account. For a typical portfolio
at ~50 conversations/month, expect cents. Sample pricing:
- `@cf/meta/llama-3.1-8b-instruct` ≈ $0.011/1M input tokens
- `@cf/baai/bge-base-en-v1.5` ≈ $0.012/1M tokens

**Rate limiting:**
A blanket WAF rate-limit rule (20 req/60s per IP on `POST /api/chat/*`)
is auto-provisioned after deploy when you've attached a custom domain.
On default `*.pages.dev` hostnames the WAF rule can't be attached;
Cloudflare's built-in bot fight / DDoS protection still applies.

**Quality trade-off:**
Llama 3.1 8B is smaller than GPT-4o-mini. For RAG-grounded Q&A about
your portfolio it's perfectly adequate — the retrieved context does
most of the work. If you need a bigger model, leave the toggle off
and the builder-hosted chatbot continues to proxy to your BYOK
provider.

**Preserving the toggle across refactors:**
Any change to `src/lib/chatbot/retrieve.ts` or `prompt.ts` must be
mirrored in `functions/_shared/`. A parity unit test
(`tests/unit/chatbot/cf-port-parity.test.ts`) fails loudly at CI if
the two copies drift.

## Decoupling guarantee — what runs where

The builder app and the portfolios it generates are deliberately separate:

- **Builder app** — this Next.js project. Runs on Vercel / Fly / your own
  host. Holds the dashboard, auth, DB, pipeline, chatbot API, preview route,
  coaching / strengthening UI, and share links.
- **Generated portfolios** — static HTML / CSS / PNG deployed to Cloudflare
  Pages. Must render cleanly even if the builder is offline.

What's baked into the deploy and what isn't:

| Surface | Baked at generation? | Runtime dependency on builder? |
|---|---|---|
| HTML pages + CSS | yes | ✗ none |
| Project data, verified claims, characterization byline | yes (strings) | ✗ none |
| OG image (`/og.png`) | yes (PNG buffer) | ✗ none — scrapers fetch it from the same origin |
| Chatbot bootstrap | yes (inlined IIFE) | ✗ none — script never fetches back to the builder |
| Chatbot iframe (the actual chat widget) | Phase 9: yes (`/chat.html` + Pages Function) when self-hosted; otherwise cross-origin to the builder | Phase 9 eliminates this coupling entirely. See the "Self-hosted chatbot" section above. |
| Analytics beacon | yes (inlined `sendBeacon` snippet) | silent fire-and-forget — failures never affect the page |
| Contact | `mailto:` link baked in | ✗ none |
| Share links (`/share/<token>`) | not referenced by any template | N/A — share links live on the builder by design (see below) |

If you shut down the builder after deploying, the portfolio still loads,
reads, and looks complete. The chatbot icon disappears instead of loading;
everything else is unaffected.

### Why share links live on the builder

The `/share/<token>` route needs DB access (to resolve a token to a
portfolio) and must work without auth, so it lives on the builder rather
than being served from the Cloudflare Pages deploy. Share links are a
pre-publish review feature, not a public permalink — once a portfolio is
published to Cloudflare Pages, that public URL is the shareable one.

When developing locally, share links embed `localhost:3000` and won't
resolve on anyone else's machine. The Share tab shows an amber warning
when it detects a local origin and documents the two paths forward — a
Cloudflare Tunnel for quick dev demos (see "Sharing a draft from
localhost" above) or deploying the builder publicly.

### Codified as a test

`tests/integration/generator/decoupling.test.ts` asserts the invariant as
40 source-inspection checks across all 5 templates. Any future change
that reintroduces a cross-origin `<script src>`, a `<form action>`, or a
builder-origin OG URL fails this test with a precise error naming the
violating file.

## Deploying the builder

The app itself is a standard Next.js 14 App Router project and runs on:

- **Vercel** — works out of the box. Caveat: Tier 2/3 layout review is
  unavailable (Playwright browsers exceed serverless size). Promote to a
  hybrid deployment or self-host if you need full review coverage.
- **Fly / Railway / Docker / self-host** — full feature set, including
  Playwright-backed layout review. Run `npx playwright install chromium
  --with-deps` as part of the build.

The generated portfolios (the sites produced *by* the builder) deploy to
Cloudflare Pages. Configure `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`
(with `Pages:Edit` scope) and the Deploy tab handles the rest.

---

## Architecture at a glance

```
GitHub repos + resume ─► Ingestion ─► Analysis (Claude)
                                         │
                                         ▼
                                    Fact extraction
                                         │
                                         ▼
                              Storyboard (structured claims)
                                         │
                                         ▼
                          Verifier dispatcher (dep/file/workflow/grep)
                                         │
                                         ▼
                             Verified claims + evidence
                                         │
                                         ▼
                            Template renderer (5 templates)
                                         │
                                         ▼
                        Static HTML + CSS ─► Preview / Deploy
```

- Pipeline orchestrator: `src/lib/pipeline/orchestrator.ts`
- DB schema (12+ tables): `src/lib/db/schema.ts`
- ProfileData contract: `templates/_shared/types.ts`
- Template renderer: `src/lib/generator/renderer.ts`
- Layout review agent: `src/lib/review/`

---

## Testing

```bash
npm test                   # unit + integration (Jest)
npm run test:e2e           # Playwright e2e
npm run typecheck          # TypeScript
```

Integration tests hit a dedicated test database — see `tests/setup/` for the
fixtures. Running the layout-review integration tests requires Chromium to
be installed.

---

## Troubleshooting

**`InvalidMasterKeyError: ENCRYPTION_KEY decoded to N bytes (need 32)`**
Your `ENCRYPTION_KEY` isn't a valid 32-byte base64 string. Regenerate with
`openssl rand -base64 32` and restart the dev server.

**Storyboard generation 400 from OpenAI**
OpenAI strict-mode JSON schema requires every property in `required`. If
you're editing `src/lib/ai/schemas/storyboard.ts`, optional fields must be
modelled as `type: ["X", "null"]` — not omitted from `required`.

**Fast Refresh full reload**
Usually benign after a structural edit. If it persists, `rm -rf .next` and
restart `npm run dev`.

**Preview tab's nav links 404**
The preview endpoint rewrites internal `<a href>` attributes through
`?page=` so iframe navigation stays inside the preview. If you see a 404 at
a `/<section>/` path, you're probably opening a stale tab — re-open the
preview from the builder UI.

---

## License

Private / unreleased.
