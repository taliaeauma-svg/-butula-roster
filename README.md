# Butula Campaign — Roles & Coverage Tracker

**Live:** https://butula-roster.netlify.app/ (currently still running the old
localStorage version — see "One-time setup" below to switch it to the shared backend)

A tool for assigning volunteers to roles and tracking staffing coverage across all 139
Butula polling stations. Unlike the `webmap/` turnout-priority tool, this one runs
entirely off real data — registered voters and station identity — so it works even
though real turnout figures aren't available.

## Roles tracked

- **Ward Coordinator** — 1 target per ward (6 total)
- **Polling Agent** — 1 target per station, election-day role (139 total)
- **Canvasser** — scaled by station size, 1 per ~150 registered voters (pre-election
  door-knocking), minimum 1 per station

Coverage targets are computed in `scripts/phase7_export_roster_seed.py` from
`data/clean/butula_stations_with_coords.csv`. Re-run that script and redeploy if the
per-canvasser voter ratio changes.

## How data is stored — shared backend

The roster is stored server-side using **Netlify Blobs**, behind a small serverless
function at `netlify/functions/roster.js` (exposed at `/api/roster`). Every visitor
reads and writes the same data, so an assignment added by one coordinator shows up for
everyone else within ~15 seconds (the page polls automatically). No login/accounts —
same openness as before, just shared instead of per-device.

- **Export CSV** any time as an offline backup or to hand data to someone else.
- **Import CSV** to bulk-add/update rows — rows are matched by ID, and the newer
  `updated_at` timestamp wins on conflicts.
- Since there's no login gate, anyone with the site link can add/edit/remove entries.
  If that becomes a problem, add Netlify's site-level password protection (Site
  configuration → Sharing & embed) — it gates the whole site, including the API,
  without needing per-volunteer accounts.

This replaced an earlier version that stored everything in browser `localStorage`
(private per device, no sync). That version is still what's live at the URL above
until the one-time setup below is completed.

## One-time setup (needs your GitHub + Netlify accounts — can't be automated)

Drag-and-drop deploys can't run `npm install` or bundle serverless functions, so
getting the shared backend live requires switching this site to Netlify's Git-based
deploys. This is a one-time setup:

1. **Create a new GitHub repository** (e.g. `butula-roster`) — empty, no README/license.
2. **Push this folder to it.** From `C:\Projects\Butula-Turnout-Tool\roster` (already a
   git repo with the shared-backend code committed):
   ```
   git remote add origin https://github.com/<your-username>/butula-roster.git
   git branch -M main
   git push -u origin main
   ```
3. **Link the existing Netlify site to that repo:** in the
   [Netlify dashboard](https://app.netlify.com), open the `butula-roster` site →
   **Site configuration** → **Build & deploy** → **Link repository** (or "Link site to
   Git" if you don't see that exact label) → choose GitHub → authorize → select the
   repo you just pushed.
4. **Set the build settings** when prompted (or afterward under Build & deploy →
   Build settings):
   - Base directory: leave blank (repo root *is* the site root)
   - Build command: leave blank (no build needed — Netlify still runs `npm install`
     for the function's dependency, then bundles it)
   - Publish directory: `.`
   - Functions directory: `netlify/functions` (should auto-detect from `netlify.toml`)
5. **Netlify Blobs needs no separate setup** — it's automatically available to
   functions on any Netlify site, included in the free tier.
6. Trigger a deploy (pushing to `main` triggers one automatically; or click **Trigger
   deploy** in the dashboard). Once it's live, tell me the URL still works and I'll
   verify the shared roster is actually responding (`/api/roster` should return `[]`
   on first load, then reflect whatever gets added).

After this is linked, future changes just need `git push` — no more manual
drag-and-drop.

## Deploying to a brand-new site instead

If you'd rather start a fresh Netlify site instead of converting the existing one,
create it via **Add new site → Import an existing project** in the Netlify dashboard
and point it at the GitHub repo from step 1 above — same build settings as step 4.

## Regenerating the station seed

If station data changes (more coordinates confirmed, a station added/removed), re-run:

```
python ../scripts/phase7_export_roster_seed.py
```

This only touches `data/stations_seed.json` and needs a redeploy (`git push`) to take
effect on the live site. It does not affect any roster entries already saved.
