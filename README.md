# Butula Campaign — Roles & Coverage Tracker

**Live:** https://butula-roster.netlify.app/

A standalone static tool (no build step, no backend) for assigning volunteers to roles
and tracking staffing coverage across all 139 Butula polling stations. Unlike the
`webmap/` turnout-priority tool, this one runs entirely off real data — registered
voters and station identity — so it works even though real turnout figures aren't
available.

## Roles tracked

- **Ward Coordinator** — 1 target per ward (6 total)
- **Polling Agent** — 1 target per station, election-day role (139 total)
- **Canvasser** — scaled by station size, 1 per ~150 registered voters (pre-election
  door-knocking), minimum 1 per station

Coverage targets are computed in `scripts/phase7_export_roster_seed.py` from
`data/clean/butula_stations_with_coords.csv`. Re-run that script and redeploy if the
per-canvasser voter ratio changes.

## How data is stored

Everything is saved in the browser's `localStorage` — nothing is sent to a server.
That means:

- It's private to whichever browser/device you're using.
- Use **Export CSV** regularly to back up the roster, and to hand off data to another
  coordinator's device.
- Use **Import CSV** to bring another coordinator's export back in — rows are merged
  by ID, and the newer `updated_at` timestamp wins on conflicts, so two people can
  work independently and reconcile later.

## Deploy options

Same as `webmap/` — this is a static site, so drag the `roster/` folder onto
[app.netlify.com/drop](https://app.netlify.com/drop), or serve it from GitHub Pages
or Vercel. See `webmap/README.md` for the exact steps.

If the deployed link redirects to a Netlify sign-in page ("Team protection"/"Site
protection"), that's a per-site setting on the Netlify account, not a code issue —
turn it off (or switch to a shared password) from Site configuration → Sharing &
embed in the Netlify dashboard so field coordinators can open the link without a
Netlify account.

## Regenerating the station seed

If station data changes (more coordinates confirmed, a station added/removed), re-run:

```
python ../scripts/phase7_export_roster_seed.py
```

This only touches `data/stations_seed.json` — it does not affect any saved roster
data in browsers that have already loaded the tool.
