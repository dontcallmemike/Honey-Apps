# Honeystash Scheduler

Two pages, one shared brain:

- **index.html** — full scheduler (desktop). Week grid, daily coverage + auto breaks, roster, requests, Google Sheets export, Sync tab.
- **quick.html** — phone quick-edit. One day at a time, big tap targets, swipe between days, live coverage chips.
- **hs-core.js** — shared data model, shift definitions, constraint engine, break rules, storage, and the export template map.

Same device = data shared automatically. Between devices = Sync tab (download backup, load on the other). Live sync can be added later via the SYNC hook without a rewrite.

## Export matches your sheet template
The export lays each person onto their exact template row and pastes at **A8**. Shifts fill the In/Out columns as `h:mm AM/PM` times; the sheet's hours column (R) recalculates itself and is never overwritten. Anyone in the app who isn't on the template is appended in a clearly labeled block so a paste never shifts rows. If the app roster and the sheet drift apart, the Export tab tells you who's missing on each side.

Template row map lives in `hs-core.js` (TEMPLATE_ROWS). Update it there if the sheet layout changes.

## July 2026 roster
Daniel Girod → Supervisor. Added PT budtenders: Ada Marin, Luis Morales, Lukas Graves, Stephanie Cruz. Francis Barber → inventory supervisor (still keyholder). Gabbie Domian mapped to the ASM row.

## Install on iPhone
Open the GitHub Pages URL in Safari → Share → Add to Home Screen. Works offline after first load.

## Enforced staff constraints
Bailey (32hr cap, off Tue/Thu, no Mon close), Daniel (no opens), Rene (end by 5 PM), Kiki (no close Tue/Thu), Rye (from 4 PM), Tim (closes only), Shakai (from 6 PM). Edit anyone in the Roster tab.
