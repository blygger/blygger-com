# blygger-com

> **Environment rules, keys & safety policies:** see [Code/CLAUDE.md](../../CLAUDE.md) — read before starting work.
> **Protocol spec + reference implementation:** [`../blygger-spec/`](../blygger-spec/) — read `blygger-spec/CLAUDE.md` and `blygger-spec/docs/` before touching anything that isn't purely presentational; this repo is a *client* of the protocol, not where protocol decisions get made.

The commercial-development-adjacent face of the Blygger protocol at
**blygger.com**. Currently it is one thing: **a directory of blygs** — a submit
box and a list of approved sites, built session 21 (2026-09-16).

**It does not run a blyg, and is not a test node.** The session-6 scaffold said
it would be one of the two initial cross-client test instances; session 11 put
those on `venkateshrao.com/blyg/` and `blyg.protocol-institute.org` instead.

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
  1. **Does a listing carry its warnings publicly?** A quiet "served over HTTP"
     beside an entry is honest and is pressure; it is also us editorialising
     about someone else's site on our page. Probably yes for facts a reader
     cares about (plaintext, unreachable) and no for the rest.
  2. ~~**Re-checking on a schedule.**~~ Built session 38 (`src/health.ts`,
     migration 0005): hourly cron, warnings rewritten on every successful
     check, dormant listings dropped from the machine surfaces only. Item 1
     is still open, so nothing about health is shown on the public page.
  3. **Telling them.** We collect an optional contact for security releases
     (migration 0002) and have never used it. A warning is not a security
     release, so reusing that channel needs a decision, not an assumption.
  4. **A per-listing page.** There is nowhere to send someone to see their own
     entry. That is the missing piece under all of the above — "check your
     directory entry" presumes an entry to check.

  Do not build 2–4 before 1: whether warnings are public changes what the rest
  of it is for.

## Status

See [`status.md`](status.md). Live since 2026-09-16.
