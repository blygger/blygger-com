// Canned blygs for route-level tests (session 38). Wired in through Miniflare's
// `outboundService` in vitest.config.ts, so a request to POST /api/submit
// resolves these hosts with the real resolver and the real fetch path. Only
// `*.fixture.test` is answered here; everything else goes to the network
// untouched, which the `.invalid` test relies on.

const SHARED = ["0dupitem00000000000000000a", "0dupitem00000000000000000b"];

function blyg(host: string, title: string, ids: string[]) {
  const origin = `https://${host}/`;
  return {
    "/": { type: "text/html", body: `<html><head><link rel="blyg" href="/blyg.json"></head></html>` },
    "/blyg.json": {
      type: "application/json",
      body: JSON.stringify({ blyg: "0.3", level: 1, site: origin, title, generator: "fixture/1.0", feed: "feed.xml", items: "items/index.json" }),
    },
    "/items/index.json": {
      type: "application/json",
      body: JSON.stringify({
        updated: "2026-10-06T00:00:00Z",
        items: ids.map((id) => ({ id, kind: "fragment", created: "2026-10-01T00:00:00Z", updated: "2026-10-01T00:00:00Z", version: 1 })),
      }),
    },
  } as Record<string, { type: string; body: string }>;
}

const SITES: Record<string, Record<string, { type: string; body: string }>> = {
  // One store on two addresses — the Pioneering Spirit shape.
  "canonical.fixture.test": blyg("canonical.fixture.test", "Fixture Blyg", SHARED),
  "mirror.fixture.test": blyg("mirror.fixture.test", "Fixture Blyg", SHARED),
  // A different blyg.
  "other.fixture.test": blyg("other.fixture.test", "Other Fixture", ["0othritem0000000000000000a"]),
};

export function outbound(request: Request): Response | Promise<Response> {
  const u = new URL(request.url);
  const site = SITES[u.hostname];
  if (!u.hostname.endsWith(".fixture.test")) return fetch(request);
  const hit = site?.[u.pathname];
  return hit
    ? new Response(hit.body, { status: 200, headers: { "content-type": hit.type } })
    : new Response("not found", { status: 404 });
}
