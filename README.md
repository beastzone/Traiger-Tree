# Family Tree Builder (Traiger Tree)

A shared, mobile-first family tree. Anyone can plant a tree; each tree can be
locked with an edit password. Leaves are people, couples sit side by side
joined by a dotted line, and children branch up from the couple.

- **web/** — the site (React + Vite), served from GitHub Pages
- **worker/** — the API (Cloudflare Worker + D1) that stores trees

## Running locally

```sh
# API on http://localhost:8787 (uses a local SQLite copy of the schema)
cd worker && npm install && npm run db:local && npm run dev

# Site on http://localhost:5173 (points at the local API via .env.development)
cd web && npm install && npm run dev
```

## Deploying

Pushes to `main` run `.github/workflows/deploy.yml`, which deploys the worker
and then builds the site against the worker's URL and publishes it to Pages.

One-time setup in the GitHub repo:

1. **Settings → Pages → Source:** GitHub Actions.
2. **Settings → Secrets and variables → Actions:** add
   - `CLOUDFLARE_ACCOUNT_ID` — from the Cloudflare dashboard sidebar
   - `CLOUDFLARE_API_TOKEN` — a token with the *Edit Cloudflare Workers* template plus *D1: Edit*

The D1 database (`traiger-tree`) already exists and has the schema applied;
`worker/schema.sql` is the source of truth if it ever needs re-creating.
