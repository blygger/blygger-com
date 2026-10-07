# Status — blygger-com

## Active
- **Session 38 (2026-10-06, Opus) — the directory as a machine surface, and kept
  true.** Deployed (migrations 0005–0007 applied remote; Worker version
  `091a939c`), pushed. Tabbed page (Blygs / Legacy RSS) with the submit form
  behind a button. `/blygs.opml` (§11-shaped OPML of listed blygs) and
  `/listings.xml` (Atom of new listings), both ETag'd and CORS-open. **Hourly
  health pass** (`src/health.ts`, cron `17 * * * *`): 4 listings per run under the
  50-subrequest cap, warnings and flags rewritten on success. Tiers (Venkat's
  ruling, recorded in `review.ts`): unreachable marked after 24 h, withdrawn from
  OPML/Atom after 72 h; defects (site mismatch, plain HTTP, private host) marked
  at once, withdrawn after 14 days; info (IP, IDN) admin-only. A listing that
  moves http→https follows in place. Blogroll sightings → admin-only "seen in
  blogrolls, not listed" invitation list. Protocol census (`blyg`, `level`,
  `generator`) shown as `vN.N`. 57 tests. **Conformance deferred** to
  [#1](https://github.com/blygger/blygger-com/issues/1) until blygger-spec#11
  merges. Later the same session: **content duplicate test** (shared archive-index
  item ids → 409; migration 0008; re-check notes, never delists), **re-checks take
  renamed titles** unless `review.ts` blocks them, the Pioneering Spirit workers.dev
  duplicate rejected, and a **blue theme** so the site stops reading as
  blygger.org. 62 tests. Open: `blyg.jdbb.net` / `jd-blyg.exe.xyz` are one blyg
  (Venkat to decide); form copy still has a "we/us" voice and two stale lines
  (held-for-a-shared-name; footer "Listing is manual").
- **An optional operator contact on submissions** (session 27, 2026-09-28, migration
  `0002_contact.sql`, **needs `--remote` apply on deploy**). Added for a gap that had
  already cost something: blygger-studio shipped a security fix to its public Webmention
  endpoint, three of the nodes advertising that endpoint are strangers', this directory
  publishes their origins — and the table held no way to reach any of them. Free text,
  never published, admin-column only, and filled-if-empty on a re-submission so an
  already-listed operator has a way in. `listApproved` now names its columns and returns
  a `PublicRow`, so a private column cannot reach a public page by being added to a row
  type. 19 tests, `tsc` clean. **The first notice still goes out by hand** — this only
  helps from the next listing onward.
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
  plain feeds display as bare hostnames while blygs display their manifest title.
  ~~The resolver reads the feed's channel title at submission and the row does not
  keep it.~~ **That diagnosis was wrong, corrected session 29:** the vendored
  resolver returns `{ kind: "rss", feedUrl }` and never surfaced a title at all, so
  there was nothing to keep. **Fixed session 29** — the directory fetches the feed
  once more at submission and reads its channel title itself, and the seven existing
  untitled rows were backfilled. One (`www.wysr.xyz`) refused the fetch and correctly
  stays a hostname.

- **Session 29 (2026-09-29): listing became automatic, then softer.** Approval was a
  human on every row; it is now a three-valued gate — **block / warn / clean** — with
  the line at *confirmed versus ambiguous*, not severe versus mild (Venkat: "Hold back
  should be for confirmed security issues. Others can be released with a warning").
  Only two things block: a credential in a public URL, and a direction-override
  character in a display name. Everything else lists and warns.

  Two rules were written and withdrawn the same afternoon, both because they punished
  strangers for things that were not attacks: a **name-collision** check (held a blyg
  titled `blyg` — which was the reference client's own default, since fixed in
  blygger-studio 0.8.3), and **"manifest claims an origin already listed here"** (held
  `[jdbb] studio blyg`, whose manifest named the operator's own previous address after
  a host move). The second is the lesson: if a rule cannot distinguish the innocent
  case by inspection, it is ambiguous by definition and belongs in the warning tier.

  `POST /admin/recheck` re-applies the rules to the queue and is idempotent, which is
  how the queue is brought back into agreement when the rules change — it was run
  three times this session as they did. **Queue is empty: 0 pending of 23.**
  Migration 0003 adds `review_reason`, 0004 adds `warnings`.

  The submit form also now points client authors at blygger.org's project template,
  since submitting a *site* and submitting the *software* are different acts and
  nothing said so.

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
