# Butula Campaign — Roles & Coverage Tracker

**Live:** https://butula-team-roster.netlify.app/

This is the Git-linked deploy with the shared backend (see below) — verified working:
adding an assignment persists server-side and shows up on a fresh page load. This is
the link to hand out to coordinators.

The original `butula-roster.netlify.app` is a separate, older site still running the
first localStorage-only version (data never left individual browsers there). It's
retired in favor of the one above — safe to delete once you've confirmed you don't
need anything from it.

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
(private per device, no sync) — that was the original `butula-roster.netlify.app`
site, now retired.

## Setup history (already done — kept here for reference / redeploying elsewhere)

Drag-and-drop deploys can't run `npm install` or bundle serverless functions, so the
shared backend needed Netlify's Git-based deploys instead. This site
(`butula-team-roster`) was created that way:

1. **GitHub repo:** `https://github.com/taliaeauma-svg/-butula-roster` — this folder's
   git history is pushed there (`main` branch).
2. **Netlify site:** created via **Add new site → Import an existing project → GitHub**,
   pointed at that repo (this was more reliable than trying to link an existing
   drag-and-drop site to a repo after the fact — that path got stuck with no
   "Trigger deploy" option ever appearing).
3. **Build settings** used:
   - Base directory: leave blank (repo root *is* the site root)
   - Build command: leave blank (no build needed — Netlify still runs `npm install`
     for the function's dependency, then bundles it)
   - Publish directory: `.`
   - Functions directory: `netlify/functions` (auto-detected from `netlify.toml`)
4. **Netlify Blobs needs no separate setup** — it's automatically available to
   functions on any Netlify site, included in the free tier.

Since it's Git-linked, future changes just need `git push origin main` — Netlify
rebuilds and redeploys automatically, no more manual drag-and-drop.

## Regenerating the station seed

If station data changes (more coordinates confirmed, a station added/removed), re-run:

```
python ../scripts/phase7_export_roster_seed.py
```

This only touches `data/stations_seed.json` and needs a redeploy (`git push`) to take
effect on the live site. It does not affect any roster entries already saved.
