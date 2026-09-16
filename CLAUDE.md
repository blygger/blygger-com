# blygger-com

> **Environment rules, keys & safety policies:** see [Code/CLAUDE.md](../../CLAUDE.md) — read before starting work.
> **Protocol spec + reference implementation:** [`../blygger-spec/`](../blygger-spec/) — read `blygger-spec/CLAUDE.md` and `blygger-spec/docs/` before touching anything that isn't purely presentational; this repo is a *client* of the protocol, not where protocol decisions get made.

The commercial-development-adjacent face of the Blygger protocol at
**blygger.com**: a home for protocol-adjacent commercial work.

Scaffolded session 6 (2026-07-24), part of the brand-rename + scaffolding session
that also produced `blygger-spec` and `blygger-org`. **Nothing has been built here
since, and the domain does not resolve.**

The scaffold described this as a live `/blyg` deployment and one of the two initial
cross-client test instances. That is no longer true: session 11 deployed the two test
nodes to `venkateshrao.com/blyg/` and `blyg.protocol-institute.org`, and the test
network has been complete since (see `blygger-spec/DEVLOG.md` session 11). So the
`/blyg`-wiring half of `blygger-spec/docs/deploy-stub-sites-plan.md` is superseded;
what is still open here is a stub landing page, and nothing about it is urgent.

## Stack

TBD — see the deployment plan doc. Likely Cloudflare Pages/Workers to match
`blygger-spec`'s toolchain, but not yet decided.

## Structure

Not yet built beyond this file, `README.md`, `.gitignore`, and `LICENSE`.

## Workflow Notes

- Git repo: `blygger/blygger-com` (public), branch `main`.
- Deployed to: `blygger.com` (not yet deployed).

## Status

See [`status.md`](status.md).
