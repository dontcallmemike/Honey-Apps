# Honeystash Scheduler

Two pages, one shared brain:

- **index.html** — full scheduler (desktop). Week grid, daily coverage + auto breaks, roster, requests, Google Sheets export, and a Sync tab.
- **quick.html** — phone quick-edit. One day at a time, big tap targets, swipe between days, live coverage chips. Tap a person to set their shift.
- **hs-core.js** — the shared data model, shift definitions, constraint engine, break rules, and storage. Edit rules here once; both pages update.

Both pages share data automatically on the **same device/browser**. To move data **between devices**, use the **Sync** tab: Download backup on one, load it on the other. (Hooks are in place to add live cloud sync later without a rewrite.)

## Install on iPhone
Open the GitHub Pages URL in Safari → Share → Add to Home Screen. Works offline after first load.

## Deploy
Push these files to the repo root (keep `.nojekyll`). GitHub Pages serves them as-is.

## Built-in staff constraints (enforced, not just notes)
- Bailey — 32 hr cap, off Tue/Thu, no Monday close
- Daniel — no opens (mids/closes only)
- Rene — must end by 5 PM
- Kiki — no close Tue/Thu
- Rye — starts no earlier than 4 PM
- Tim — closes only
- Shakai — starts no earlier than 6 PM

Edit any person in the Roster tab. New hires: **+ Add person**.
