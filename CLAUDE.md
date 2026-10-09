# blygger-com

> **Environment rules, keys & safety policies:** see [Code/CLAUDE.md](../../CLAUDE.md) — read before starting work.
> **Protocol spec + reference implementation:** [`../blygger-spec/`](../blygger-spec/) — read `blygger-spec/CLAUDE.md` and `blygger-spec/docs/` before touching anything that isn't purely presentational; this repo is a *client* of the protocol, not where protocol decisions get made.

The commercial-development-adjacent face of the Blygger protocol at
**blygger.com**. Currently it is one thing: **a directory of blygs** — a submit
box and a list of approved sites, built session 21 (2026-09-16).

**It does not run a blyg, and is not a test node.** The session-6 scaffold said
it would be one of the two initial cross-client test instances; session 11 put
those on `venkateshrao.com/blyg/` and `blyg.protocol-institute.org` instead.

## Voice

Read [`VOICE.md`](VOICE.md) before writing any page copy, form text, message or
reply in the project's name. **Speak for the ecosystem and everyone building it;
nobody is an outsider** — no "we/us/ours" set against "strangers" or "other
people's". `VOICE.md` is kept as identical copies in blygger-org and blygger-com:
change both in the same sitting (`cmp` them).

## Stack

Cloudflare Worker + D1 + Hono + TypeScript — deliberately the same stack as the
reference client, so there is nothing new to learn moving between them.

| Path | Role |
|---|---|
| `src/index.ts` | Routes. `GET /`, `GET /blygs.opml`, `GET /listings.xml`, `POST /api/submit`, `/admin*`; the hourly `scheduled` handler. |
| `src/health.ts` | The hourly pass: re-resolves 4 listings per run, marks a listing **dormant** after 72 h of unbroken failures (out of the OPML and Atom feed, still on the page), and records blogroll sightings (admin-only "seen in blogrolls, not listed"). Budget notes at the top. |
| `src/validate.ts` | Runs the v0.2 resolver against a submission. |
| `src/store.ts` | Every D1 query. `listApproved` bakes in `status='approved'` so no code path can leak a pending row, and names its columns so no code path can leak a private one. |
| `src/pages.ts` | Public page, login page, admin queue. Server-rendered, no framework. |
| `src/auth.ts` | Lifted from the reference client; only the cookie name differs. |
| `src/vendor/` | **Copied** from `blygger-spec/worker/src/` — never edit here. |

## The vendored resolver

The directory validates submissions with blygger-spec's own resolution
algorithm. Separate repo and separate deployment, so the code is **vendored, not
imported**: `npm run sync-vendor` re-copies `resolve.ts`, `feed.ts` and
`http.ts`, and `git diff src/vendor/` then shows exactly what changed upstream.
Vendored code drifts silently; that script exists to make drift visible.

Re-sync whenever blygger-spec's resolver changes — especially at v0.3, when
resolution gains cross-client concerns.

## Private columns

Two columns are **admin-only and must never reach a rendered public page**:
`admin_note`, and `contact` (migration 0002 — an optional operator email/handle,
collected so that a security release in `blygger-studio` can actually be
delivered to the people running it).

The enforcement is structural rather than a rule to remember: `listApproved`
selects `kind, title, home_url` by name and returns `PublicRow`, and
`publicPage` takes `PublicRow` — not `SubmissionRow`. **Add a column to the
public page deliberately or it is not public.** A test asserts a contact string
is absent from `GET /` and present on the admin page.

## Conventions inherited from blygger-spec

- **Inline page scripts live in TS template literals**, so escapes are a live
  hazard — write `\\n`, not `\n`, inside a string. `test/directory.test.ts`
  compiles every inline script via `new Function`, including the admin page's,
  which no request-level test can reach because the route is gated.
- **Secrets are wrangler secrets only**, registered in `Code/.env.keys`.
- Assert on controls (`data-act="approved"`), not on words — every page inlines
  the stylesheet, so a substring check for "approve" matches `.status-approved`
  in CSS and proves nothing.

## npm install needs `--legacy-peer-deps`

npm 10.9.0's peer resolver crashes (`TypeError: Cannot read properties of null
(reading 'edgesOut')`) on vitest's optional peer graph — reproducible with a
bare `npm install vitest@4.1.10` in an empty directory, so it is the
environment, not this project. Versions are pinned to blygger-spec/worker's
known-good resolved tree. See `Code/warnings-node.md`.

## Deployment

Worker `blygger-com` on the **personal** Cloudflare account, D1 `blygger-com`,
Custom Domain `blygger.com`. Secrets registered in `Code/.env.keys` as
`BLYGGER_COM_OWNER_PASSWORD` / `BLYGGER_COM_COOKIE_SECRET`.

```bash
npx wrangler deploy
npx wrangler d1 migrations apply blygger-com --remote   # when migrations change
```

## TODO

- [ ] **Close the loop on warnings — how does an operator ever learn they have one?**
  (Venkat, session 29.) Listing now warns rather than holds, which means a
  stale manifest `site`, a plaintext link or an unreachable host gets published
  *and stays that way*, because the only moment the operator sees the warning is
  the second they submit. That is the wrong shape: the warning describes
  something only they can fix, and we have no way to nudge them.

  What needs deciding, roughly in this order:
  1. ~~**Does a listing carry its warnings publicly?**~~ Ruled by Venkat,
     session 38: yes, from re-checks, and persistent ones withdraw the listing
     from `blygs.opml`/`listings.xml` until fixed. Built as three tiers
     (`review.ts` `FindingCode`/`DEFECTS`, thresholds in `health.ts`):
     unreachable — shown after 24 h, withdrawn after 72 h; **defects**
     (site mismatch, plain HTTP, private host) — shown at once, withdrawn after
     14 days; **info** (bare IP, IDN) — admin only, never withdrawn.
     Submission-time findings are never shown publicly; only re-checks are.
  2. ~~**Re-checking on a schedule.**~~ Built session 38 (`src/health.ts`,
     migrations 0005–0006): hourly cron, warnings and flags rewritten on every
     successful check, an http→https move followed in place.
  3. **Telling them.** We collect an optional contact for security releases
     (migration 0002) and have never used it. A warning is not a security
     release, so reusing that channel needs a decision, not an assumption.
  4. **A per-listing page.** There is nowhere to send someone to see their own
     entry. That is the missing piece under all of the above — "check your
     directory entry" presumes an entry to check.

  1 and 2 are done; 3 and 4 remain. **Conformance is not here yet:** the
  re-check is the submission check (resolver + `review.ts`), and records
  nothing about protocol version or feed validity. The real validator is
  blygger-spec roadmap 1.4 / decision #48 (`blygger-spec/conformance/`, not
  built); this directory should become its first consumer rather than grow
  its own. **Options filed as [#1](https://github.com/blygger/blygger-com/issues/1),
  deferred until blygger-spec#11 merges.**

## Status

See [`status.md`](status.md). Live since 2026-09-16.

## Anthropic keys (changed 2026-10-07)

This Worker uses no Anthropic key. If one is ever added, create its own (service account + single-workspace key) per `Code/warnings-keys.md`; do not reuse another project's.

## Session rituals

**Base:** [`Code/devops/rituals.md`](../../devops/rituals.md) — v1.0. Startup is S1–S7, wrap-up is W0–W7 (IDs reserved). Everything below is this
project's **local config**; it adds to the base and never replaces it.

**Ritual config**
- **Log:** `../blygger-spec/DEVLOG.md` (the one program log for all four repos; dated entry, non-skippable) plus a line in this repo's `status.md`.
- **Startup extras (S5):** new PRs and issues in all four repos (S5b in `../blygger-spec/CLAUDE.md`)
- **Verification (W2):** request the Worker route and check the admin queue still loads.
- **Wrap-up extras (after W5):** update `../blygger-spec/ROADMAP.md` (W5b in `../blygger-spec/CLAUDE.md`)
- **Deploy policy:** only if Venkat says so.
- **Carry-overs (S6):** none
