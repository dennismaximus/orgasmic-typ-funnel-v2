# Deploy on Netlify

This folder is Netlify-ready (relative paths only).

## Option A — Drag & drop
1. Zip **the contents** of `orgasmic-typ-funnel-v2` (or use `orgasmic-typ-funnel-v2-netlify-ready.zip` on Desktop).
2. Netlify → Sites → Add new site → Deploy manually → drop the zip.
3. In Site settings → Build & deploy: leave Publish directory empty/`.` and Functions `netlify/functions` (or rely on `netlify.toml`).

## Option B — CLI
```bash
cd ~/Desktop/orgasmic-typ-funnel-v2
npx netlify-cli deploy --prod --dir=.
```

## Do NOT
- Set publish/functions to any `C:\Users\...` path in the Netlify UI.
- If UI still shows old Windows paths: clear them, save, redeploy.

## Note
Functions need the site’s existing Netlify env vars (KUNDE_ID, Mautic, Meta, etc.) — same as the live typ funnel.
