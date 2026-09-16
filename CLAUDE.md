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
| `src/index.ts` | Routes. `GET /`, `POST /api/submit`, `/admin*`. |
| `src/validate.ts` | Runs the v0.2 resolver against a submission. |
| `src/store.ts` | Every D1 query. `listApproved` bakes in `status='approved'` so no code path can leak a pending row. |
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

## Status

See [`status.md`](status.md). **Not deployed** — blocked on DNS onboarding.
