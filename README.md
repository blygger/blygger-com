# blygger.com

A directory of blygs — sites publishing with the
[Blygger protocol](https://blygger.org).

One page: an *add your blyg* box, then a list of approved entries. Links go to
each site's **home page, not its feed** — this is a directory of blygs, not a
feed reader.

**Status: built, not deployed.** `blygger.com` is not onboarded to Cloudflare
DNS yet, which is a dashboard action the API token cannot perform. Run it
locally with `npm run dev`.

## How a submission works

1. Anyone POSTs a URL — no account, no gate. The gate is approval, not submission.
2. **The v0.2 resolution algorithm runs against it** — the same one a blyg client
   runs when you subscribe to something (normalize → `blyg.json` probe →
   feed-upgrade via `<blyg:manifest>` → one-hop `rel="blyg"` → conventional
   mounts → RSS fallback). The result records whether it is a real blyg or a
   plain feed, plus the resolved origin, title and home page.
3. It sits as `pending`. Nothing is public until a human approves it.

Step 2 is the reason this exists at all: it points the reference resolver at
strangers' real sites, which is a test of the spec we have no other way to run.
Resolution failures are reported to the submitter with what was tried.

## Development

```bash
npm install --legacy-peer-deps      # see the note in package.json
npm run dev                         # http://localhost:8810
npm test
```

Admin queue is at `/admin`, gated by `OWNER_PASSWORD` (same cookie-auth scheme
as the reference client's studio).

`src/vendor/` is copied from `blygger-spec/worker/src/` — **do not edit it
there**. Re-sync with `npm run sync-vendor` and review the diff.

## License

[MIT](LICENSE).
