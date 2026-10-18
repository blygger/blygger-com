// Canned blygs for route-level tests (session 38). Wired in through Miniflare's
// `outboundService` in vitest.config.ts, so a request to POST /api/submit
// resolves these hosts with the real resolver and the real fetch path. Only
// `*.fixture.example` is answered here; everything else goes to the network
// untouched, which the `.invalid` test relies on. Not `.test`: the vendored
// outbound policy refuses that TLD as private before it looks anything up.

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
  "canonical.fixture.example": blyg("canonical.fixture.example", "Fixture Blyg", SHARED),
  "mirror.fixture.example": blyg("mirror.fixture.example", "Fixture Blyg", SHARED),
  // A different blyg.
  "other.fixture.example": blyg("other.fixture.example", "Other Fixture", ["0othritem0000000000000000a"]),
  // A templated blyg in the Soapbox for Blygger shape (protocol 0.4, §6.1): the
  // manifest at the default place, everything else under /wp-json/, and nothing
  // at the default feed path.
  "wp.fixture.example": {
    "/blyg/blyg.json": {
      type: "application/json",
      body: JSON.stringify({
        blyg: "0.4", level: 2, site: "https://wp.fixture.example/blyg/", title: "WordPress Fixture", generator: "soapbox-for-blygger/0.1.2",
        feed: "https://wp.fixture.example/wp-json/soapbox-blyg/v1/feed",
        items: "https://wp.fixture.example/wp-json/soapbox-blyg/v1/items",
        item: "https://wp.fixture.example/wp-json/soapbox-blyg/v1/items/{id}",
      }),
    },
    "/wp-json/soapbox-blyg/v1/items": {
      type: "application/json",
      body: JSON.stringify({ updated: "2026-10-17T00:00:00Z", items: [{ id: "0wpitem000000000000000000a", kind: "fragment", created: "2026-10-17T00:00:00Z", updated: "2026-10-17T00:00:00Z", version: 1 }] }),
    },
  },
};

export function outbound(request: Request): Response | Promise<Response> {
  const u = new URL(request.url);
  // The vendored outbound policy (studio 0.28) checks each destination's DNS
  // over HTTPS before fetching it. Fixture hosts resolve to a public address.
  if (u.hostname === "cloudflare-dns.com" && (u.searchParams.get("name") ?? "").endsWith(".fixture.example")) {
    const type = Number(u.searchParams.get("type"));
    return Response.json({ Status: 0, Answer: type === 1 ? [{ type: 1, data: "93.184.216.34" }] : [] });
  }
  const site = SITES[u.hostname];
  if (!u.hostname.endsWith(".fixture.example")) return fetch(request);
  const hit = site?.[u.pathname];
  return hit
    ? new Response(hit.body, { status: 200, headers: { "content-type": hit.type } })
    : new Response("not found", { status: 404 });
}
