# Status — blygger-com

## Active
- **Directory built** (session 21, 2026-09-16): single-page blyg directory —
  submit box + approved listing, admin-gated review, submissions validated by
  running blygger-spec's own v0.2 resolver. Worker + D1, 17 tests, `tsc` clean.
  Verified locally against the two real live nodes (both resolved as `blyg`) and
  simonwillison.net (correctly resolved as a plain feed).
- **Deployed 2026-09-16** at [blygger.com](https://blygger.com). The earlier
  "blocked on DNS onboarding" note was wrong: the zone was already active on the
  personal account (Venkat had registered the domain through Cloudflare) — it
  simply had nothing connected to it, and a failed `curl` was mistaken for a
  missing zone. Worker + D1 provisioned, Custom Domain auto-created, secrets
  registered in `Code/.env.keys`. Both live nodes submitted and awaiting approval
  at `/admin`.

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
