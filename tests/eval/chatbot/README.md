# Chatbot eval battery

Recruiter-pattern question battery for the visitor chatbot. Run after
any chunker (`src/lib/chatbot/chunker.ts`) or prompt
(`src/lib/chatbot/prompt.ts` / `functions/_shared/prompt.ts`) change to
catch regressions before they reach a deployed portfolio.

## Why this exists

During the R8 → R8.4 chunker iteration, an organic 19-question battery
caught a series of failure modes — template leaks, missing employer
recall, "9+ years" inflated by a masters-degree gap, "IC roles"
mis-decoded as "in-house," tenure conflated with career total, refusal
on visa questions, etc. Each iteration's results are preserved under
`results/` so future changes can diff vs history.

Net journey through the loop: **6 ✅ baseline → 12 ✅ in v6, with all
hard fails eliminated.** The questions captured here are the
regression surface those fixes were measured against.

## Usage

```bash
npm run eval:chatbot -- <portfolioId> <baseUrl> [ownerName]
```

Examples:

```bash
# Live deploy
npm run eval:chatbot -- 236f55c5-588e-4f55-a9f3-a64ff301f608 https://shashank-cm.dev "Shashank C M"

# Local dev
npm run eval:chatbot -- 236f55c5-... http://localhost:3000

# Stage / preview branch
npm run eval:chatbot -- <id> https://staging.example.com
```

The `ownerName` argument is interpolated into the literal `<NAME>`
placeholder in the question file. Defaults to `"the portfolio owner"`.

## Output

Each run writes a timestamped JSONL to `tests/eval/chatbot/results/`,
one line per question:

```
{ "i": 1, "category": "identity", "q": "Tell me about Shashank C M…", "reply": "…", "latency": 1.4, "err": null, "outOfScope": false }
```

There's no automated scoring. Read the JSONL manually and label each
reply:

| Label | Meaning |
|---|---|
| ✅ | Correct, complete, on-topic |
| 🟡 | Partial — missed details, hedged unnecessarily, or LLM noise |
| ❌ | Wrong, refused when it shouldn't have, or hallucinated |
| 🚫 | Correctly declined an out-of-scope question (e.g. salary) |

The PR description / commit message that ships the change should
include the tally and a one-line summary per regressed/improved
question.

## Adding questions

Edit `questions.json`. Each question is `{ id, category, q,
outOfScope? }`. Use the literal string `<NAME>` where the owner's
name should appear; the runner replaces it.

Mark `outOfScope: true` for questions where refusal is the correct
answer (e.g. salary, personal life, predictions about the owner's
future). Add a short `outOfScopeNote` explaining why so future
maintainers don't accidentally try to "fix" the refusal.

Don't add questions that depend on the data being set in a specific
way (e.g. "is he authorized to work in Canada?" only works if the
portfolio has Canada in their work eligibility). Those are owner-
specific data-presence checks, not chatbot regression checks.

## When to run

- **Always** after a change to `src/lib/chatbot/chunker.ts`
- **Always** after a change to `src/lib/chatbot/prompt.ts` (the parity
  test will catch divergence with the CF Functions copy automatically)
- **Sometimes** after a change to `src/lib/pipeline/steps/embedding-generate.ts`
- **Sometimes** after upgrading the embedding or generation model

The corpus changes don't propagate to a deployed portfolio
automatically. After any chunker change:

1. `npm run reembed:portfolio -- <portfolioId>` (regenerates the
   embeddings table)
2. Click **Republish** in the builder (bakes
   `functions/_shared/embeddings.ts` into the Cloudflare Pages deploy)
3. Hard-reload the site to bust the iframe HTML cache
4. Then run the eval battery

## Limitations

- One owner per run — the battery is generic but expected answers
  depend on the owner's data shape, so manual scoring is needed.
- Network-dependent — runs against a live URL; can't be part of
  `npm test`.
- Workers AI rate-limited — the runner spaces requests by 600ms; full
  battery takes ~30-60 seconds.
- The question set is opinionated to recruiter-style queries. For
  other audiences (peer engineers, students, sales prospects),
  you'd want a different set.
