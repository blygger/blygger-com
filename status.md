# Status — blygger-com

## Active
- **Directory built** (session 21, 2026-09-16): single-page blyg directory —
  submit box + approved listing, admin-gated review, submissions validated by
  running blygger-spec's own v0.2 resolver. Worker + D1, 17 tests, `tsc` clean.
  Verified locally against the two real live nodes (both resolved as `blyg`) and
  simonwillison.net (correctly resolved as a plain feed).
- **Not deployed.** Blocked on `blygger.com` DNS onboarding — a Cloudflare
  dashboard action (add site, change nameservers at the registrar) that the API
  token cannot perform. `wrangler.jsonc` is ready; the D1 id is a placeholder
  until `wrangler d1 create blygger-com` runs.

## Upcoming
- Stub landing page for blygger.com. The domain does not currently resolve.
- The `/blyg` test-client half of `blygger-spec/docs/deploy-stub-sites-plan.md`
  is **superseded** (session 11, recorded here session 21): the two-node test
  network went to `venkateshrao.com/blyg/` + `blyg.protocol-institute.org` and
  has been complete since. Only the landing page is still open, and it is not
  urgent.

## Done
- **2026-07-24** — Repo scaffolded (CLAUDE.md, README.md, LICENSE, .gitignore),
  created as `blygger/blygger-com` on GitHub, part of the session-6 brand
  rename + scaffolding work.
