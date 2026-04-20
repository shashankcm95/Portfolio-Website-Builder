# OG image fonts

Drop Inter TTF/WOFF files here to give the dynamic OG image endpoint
(`/api/og`) a consistent look across deploys. The endpoint loads these at
startup — if they're missing it falls back to `@vercel/og`'s built-in
system fonts (less branded but still readable).

Expected filenames:
- `inter-regular.ttf`
- `inter-semibold.ttf`
- `inter-bold.ttf`

One-time setup (any dev machine with curl):

```bash
# From rsms/inter (Apache-2.0). TTFs not shipped in git to keep the repo lean.
cd public/og-fonts
BASE="https://github.com/rsms/inter/raw/v4.0/docs/font-files"
curl -fsSLo inter-regular.ttf  "$BASE/Inter-Regular.otf"
curl -fsSLo inter-semibold.ttf "$BASE/Inter-SemiBold.otf"
curl -fsSLo inter-bold.ttf     "$BASE/Inter-Bold.otf"
```

(Filenames use `.ttf` suffixes even though the source is `.otf` — the
`@vercel/og` loader accepts both. Keeping the suffixes consistent
simplifies the load-order code.)

The OG endpoint is designed to self-heal: missing files = fallback fonts,
no error. So forgetting this step only affects visual polish, not uptime.
