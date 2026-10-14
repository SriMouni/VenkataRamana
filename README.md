# Maharshi Ramana — Stories & Cartoons

Website for actor and writer Maharshi Ramana's Telugu short stories and cartoons.
Static HTML/CSS/JS on GitHub Pages, with **Supabase** for the database, image storage and admin login.

- **Website:** https://srimouni.github.io/VenkataRamana/
- **Admin (not linked from the site):** https://srimouni.github.io/VenkataRamana/admin.html

```
index.html, js/main.js     public site: stories, cartoons, about, gallery, story pages with sharing
admin.html, js/admin.js    sign in, write/edit stories (rich text), upload cartoons & photos, edit About
js/common.js               shared Supabase client, topics, helpers
js/config.js               Supabase URL + public anon key (safe to publish; security rules protect writes)
css/                       styles (light & dark themes)
assets/                    logo and illustrations
supabase/schema.sql        tables, security rules, storage bucket
scripts/                   local server, Supabase setup, PDF import
```

## Run locally

Needs only Node (no `npm install`):

```
npm start
```

Open http://localhost:3000 — admin at http://localhost:3000/admin.html.

## Deploying

Every push to `main` publishes the site via GitHub Actions (`.github/workflows/deploy.yml`).
One-time: repo **Settings → Pages → Source: GitHub Actions**.

## Supabase setup (already done)

`npm run setup` reads `.env` (see `.env.example`), creates/updates the tables and storage, loads the stories,
creates the admin login and writes `js/config.js`. `.env` holds secrets and is never committed.

## Re-importing stories from the PDF

```
python scripts/extract_pdf.py "C:/path/to/Ramana.pdf"
npm run seed
```

The PDF's Telugu text is repaired automatically; a few words may still need fixing in the admin editor.
