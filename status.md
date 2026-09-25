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
- **First two listings approved** (session 22, 2026-09-16): Protocol Institute Blyg
  (`blyg.protocol-institute.org`) and Venkatesh Rao's Blyg (`venkateshrao.com/blyg/`),
  both resolved `kind: "blyg"` with their real manifest titles. The directory now
  lists publicly and the queue is empty — satisfying the last open line of
  `self-host-plan.md` §9's definition of done.

- **First third-party listings approved** (2026-09-25, the day after the Symposium
  talk): the directory now lists **five blygs and three plain feeds**, and the queue is
  empty. Three of the blygs are strangers' — `jd-blyg.exe.xyz`, `blyg.aneeshsathe.com`
  and `thinking.drwip.com` — all stood up from `blygger.org/start/` with no contact with
  us, all serving conformant `blyg 0.3` manifests from `blyg-ref/0.3.0`. drwip is
  **path-mounted at `/blyg/`** and was found through its `<link rel="blyg">`, which is
  the first time decision #14's mount independence has been exercised by someone else.
  One submission was **rejected as a duplicate**: `thinking.drwip.com` was submitted
  twice, once resolving `blyg` and once resolving the root `rss.xml` as a plain feed —
  the same publication, which would have listed one site under two badges.
  **Directory weakness this exposed:** a `feed`-kind row has no title, so the three
  plain feeds display as bare hostnames while blygs display their manifest title. The
  resolver reads the feed's channel title at submission and the row does not keep it.

## Upcoming
- ~~Stub landing page for blygger.com. The domain does not currently resolve.~~
  **Stale, corrected session 22 (2026-09-16):** superseded twice over — the domain
  resolves and the site is a working directory, not a stub. Written session 6 and
  left standing through the session-21 deploy recorded two paragraphs above it.
- The `/blyg` test-client half of `blygger-spec/docs/deploy-stub-sites-plan.md`
  is **superseded** (session 11, recorded here session 21): the two-node test
  network went to `venkateshrao.com/blyg/` + `blyg.protocol-institute.org` and
  has been complete since. Only the landing page is still open, and it is not
  urgent.

## Done
- **2026-07-24** — Repo scaffolded (CLAUDE.md, README.md, LICENSE, .gitignore),
  created as `blygger/blygger-com` on GitHub, part of the session-6 brand
  rename + scaffolding work.
