// The directory's whole contract: nothing is public until approved, submissions
// are resolved with the real resolver, and the admin surface is actually gated.

import { describe, expect, it } from "vitest";
import { env, SELF } from "cloudflare:test";
import { get, login, postJson } from "./helpers.ts";
import { validateSubmission } from "../src/validate.ts";
import type { FetchResult } from "../src/vendor/http.ts";

/** Minimal FetchLike over a path->body map, same shape the importer tests use. */
function stubFetch(routes: Record<string, { status?: number; body: string; type?: string }>) {
  return async (url: string): Promise<FetchResult> => {
    const hit = routes[url];
    if (!hit) {
      return { ok: false, status: 404, url, headers: new Headers(), text: async () => "" };
    }
    return {
      ok: (hit.status ?? 200) < 400,
      status: hit.status ?? 200,
      url,
      headers: new Headers({ "content-type": hit.type ?? "text/html" }),
      text: async () => hit.body,
    };
  };
}

describe("validation runs the real resolver", () => {
  it("recognises a blyg from its manifest", async () => {
    const v = await validateSubmission(
      "https://example.com/blyg/",
      stubFetch({
        "https://example.com/blyg/blyg.json": {
          body: JSON.stringify({ blyg: "0.2", site: "https://example.com/blyg/", title: "Example Blyg" }),
          type: "application/json",
        },
      }),
    );
    expect(v.kind).toBe("blyg");
    expect(v.origin).toBe("https://example.com/blyg/");
    expect(v.title).toBe("Example Blyg");
    // The directory lists home pages, not feeds.
    expect(v.homeUrl).toBe("https://example.com/blyg/");
  });

  it("records a site mismatch rather than adopting the asserted origin", async () => {
    const v = await validateSubmission(
      "https://mirror.example/blyg/",
      stubFetch({
        "https://mirror.example/blyg/blyg.json": {
          body: JSON.stringify({ blyg: "0.2", site: "https://original.example/blyg/" }),
          type: "application/json",
        },
      }),
    );
    expect(v.kind).toBe("blyg");
    // Decision #17: identity is the fetch origin, never the manifest's claim.
    expect(v.origin).toBe("https://mirror.example/blyg/");
    expect(v.note).toContain("original.example");
  });

  it("reports a failure with what it tried, instead of silently dropping it", async () => {
    const v = await validateSubmission("https://nothing.example/", stubFetch({}));
    expect(v.kind).toBe("failure");
    expect(v.note).toContain("tried");
  });

  it("rejects a non-http scheme without fetching anything", async () => {
    const v = await validateSubmission("javascript:alert(1)", stubFetch({}));
    expect(v.kind).toBe("failure");
    expect(v.note).toContain("http(s)");
  });
});

// Renamed session 29: listing is automatic now, so "nothing is public until
// approved" no longer describes the *policy*. What these three still pin is the
// invariant underneath it, which did not change and must not — the public query
// shows approved rows and nothing else, whoever set the status and whenever.
describe("the public list shows approved rows and nothing else", () => {
  it("a submitted blyg does not appear on the public page", async () => {
    await env.DB.prepare(
      `INSERT INTO submissions (id, submitted_url, kind, origin, title, home_url, status, submitted_at)
       VALUES ('p1','https://pending.example/','blyg','https://pending.example/','Pending Site',
               'https://pending.example/','pending','2026-09-16T00:00:00Z')`,
    ).run();
    const html = await (await get("/")).text();
    expect(html).not.toContain("Pending Site");
    expect(html).toContain("No blygs listed yet.");
  });

  it("appears once approved, linking the home page", async () => {
    await env.DB.prepare(`UPDATE submissions SET status = 'approved' WHERE id = 'p1'`).run();
    const html = await (await get("/")).text();
    expect(html).toContain("Pending Site");
    expect(html).toContain('href="https://pending.example/"');
  });

  it("a rejected entry disappears again", async () => {
    await env.DB.prepare(`UPDATE submissions SET status = 'rejected' WHERE id = 'p1'`).run();
    expect(await (await get("/")).text()).not.toContain("Pending Site");
    await env.DB.prepare(`DELETE FROM submissions WHERE id = 'p1'`).run();
  });
});

describe("the directory splits blygs from legacy RSS", () => {
  it("each kind renders in its own panel", async () => {
    const { publicPage } = await import("../src/pages.ts");
    const html = publicPage([
      { kind: "blyg", title: "A Blyg", home_url: "https://b.example/", origin: "https://b.example/", listed_at: "2026-10-01T00:00:00Z", failing_since: null, flags: null, defect_since: null, protocol: null, level: null, generator: null },
      { kind: "rss", title: "A Feed", home_url: "https://f.example/", origin: "https://f.example/rss", listed_at: "2026-10-01T00:00:00Z", failing_since: null, flags: null, defect_since: null, protocol: null, level: null, generator: null },
    ]);
    const blygs = html.slice(html.indexOf('id="panel-blygs"'), html.indexOf('id="panel-legacy"'));
    const legacy = html.slice(html.indexOf('id="panel-legacy"'));
    expect(blygs).toContain("A Blyg");
    expect(blygs).not.toContain("A Feed");
    expect(legacy).toContain("A Feed");
    expect(legacy).not.toContain("A Blyg");
    expect(html).toContain('aria-controls="panel-blygs"');
    expect(html).toContain('aria-controls="panel-legacy"');
  });

  it("the submit form sits behind a disclosure, above the directory", async () => {
    const html = await (await get("/")).text();
    expect(html.indexOf('<details class="add-wrap">')).toBeGreaterThan(-1);
    expect(html.indexOf('<form class="add" id="add">')).toBeGreaterThan(html.indexOf('<details class="add-wrap">'));
    expect(html.indexOf('<section id="dir">')).toBeGreaterThan(html.indexOf("</details>"));
  });
});

describe("blygs.opml", () => {
  it("lists approved blygs only, as §11-shaped outlines, and never a contact", async () => {
    const { insertSubmission } = await import("../src/store.ts");
    const mk = (n: string, kind: "blyg" | "rss", origin: string, contact: string | null = null) =>
      insertSubmission(env.DB, {
        submittedUrl: origin, kind, origin, title: n, homeUrl: kind === "rss" ? "https://legacy.example/" : origin,
        resolveNote: null, contact, reviewReason: null, warnings: [],
      });
    const a = await mk("Opml Blyg & Co", "blyg", "https://ob.example/blyg/", "secret@private.example");
    const b = await mk("Opml Feed", "rss", "https://legacy.example/rss");
    const held = await mk("Opml Held", "blyg", "https://held.example/");
    await env.DB.prepare(`UPDATE submissions SET status = 'pending' WHERE id = ?`).bind(held).run();

    const res = await get("/blygs.opml");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/x-opml");
    const xml = await res.text();
    expect(xml).toContain('<opml version="2.0">');
    expect(xml).toContain('text="Opml Blyg &amp; Co"');
    expect(xml).toContain('xmlUrl="https://ob.example/blyg/feed.xml" htmlUrl="https://ob.example/blyg/"');
    expect(xml).not.toContain("Opml Feed");
    expect(xml).not.toContain("Opml Held");
    expect(xml).not.toContain("private.example");
    expect(xml).not.toContain("blyg:");

    const again = await SELF.fetch("https://blygger.com/blygs.opml", { headers: { "if-none-match": res.headers.get("etag")! } });
    expect(again.status).toBe(304);

    for (const id of [a, b, held]) await env.DB.prepare(`DELETE FROM submissions WHERE id = ?`).bind(id).run();
  });

  it("is advertised from the page head", async () => {
    expect(await (await get("/")).text()).toContain('rel="outline" type="text/x-opml"');
  });
});

describe("operator contact (migration 0002) — collected, never published", () => {
  const CONTACT = "operator@private.example";

  it("reaches the owner's queue and never the public page", async () => {
    const { insertSubmission } = await import("../src/store.ts");
    const { adminPage } = await import("../src/pages.ts");
    const { listForReview } = await import("../src/store.ts");
    const id = await insertSubmission(env.DB, {
      submittedUrl: "https://contact.example/blyg/",
      kind: "blyg",
      origin: "https://contact.example/blyg/",
      title: "Contactable",
      homeUrl: "https://contact.example/blyg/",
      resolveNote: null,
      contact: CONTACT,
      reviewReason: null,
      warnings: [],
    });
    await env.DB.prepare(`UPDATE submissions SET status = 'approved' WHERE id = ?`).bind(id).run();

    // Listed, and the listing is the only thing that crossed over: the public
    // query names its columns, so there is no path by which this string could
    // be rendered even by a page that wanted to.
    const publicHtml = await (await get("/")).text();
    expect(publicHtml).toContain("Contactable");
    expect(publicHtml).not.toContain(CONTACT);
    expect(publicHtml).not.toContain("private.example");

    expect(adminPage(await listForReview(env.DB))).toContain(CONTACT);
    await env.DB.prepare(`DELETE FROM submissions WHERE id = ?`).bind(id).run();
  });

  it("a later submission fills an empty contact and never overwrites one", async () => {
    const { insertSubmission, setContactIfEmpty, getById } = await import("../src/store.ts");
    const blank = await insertSubmission(env.DB, {
      submittedUrl: "https://quiet.example/blyg/",
      kind: "blyg",
      origin: "https://quiet.example/blyg/",
      title: "Quiet",
      homeUrl: "https://quiet.example/blyg/",
      resolveNote: null,
      reviewReason: null,
      warnings: [],
      contact: null,
    });
    await setContactIfEmpty(env.DB, blank, CONTACT);
    expect((await getById(env.DB, blank))?.contact).toBe(CONTACT);

    // The operator's own contact survives someone else submitting their blyg.
    await setContactIfEmpty(env.DB, blank, "stranger@elsewhere.example");
    expect((await getById(env.DB, blank))?.contact).toBe(CONTACT);
    await env.DB.prepare(`DELETE FROM submissions WHERE id = ?`).bind(blank).run();
  });
});

describe("admin is gated", () => {
  it("shows a login form to anonymous visitors, not the queue", async () => {
    const html = await (await get("/admin")).text();
    expect(html).toContain("Owner password");
    // Assert on the actual control, not the word: every page inlines the
    // stylesheet, which contains `.status-approved`, so a substring check for
    // "approve" passes on the login page and proves nothing.
    expect(html).not.toContain('data-act="approved"');
    expect(html).not.toContain('<table class="review">');
  });

  it("refuses review actions without a session", async () => {
    const r = await postJson("/admin/review/whatever", { status: "approved" });
    expect(r.status).toBe(401);
  });

  it("lets the owner in and shows the queue", async () => {
    const cookie = await login();
    const html = await (await get("/admin", cookie)).text();
    expect(html).toContain("Review");
    expect(html).not.toContain("Owner password");
  });

  it("404s a review of an id that does not exist, rather than silently succeeding", async () => {
    const cookie = await login();
    const r = await postJson("/admin/review/nope", { status: "approved" }, cookie);
    expect(r.status).toBe(404);
  });

  it("rejects a status that is not one of the three", async () => {
    const cookie = await login();
    const r = await postJson("/admin/review/nope", { status: "deleted" }, cookie);
    expect(r.status).toBe(400);
  });
});

describe("submission endpoint", () => {
  it("rejects an empty body", async () => {
    expect((await postJson("/api/submit", {})).status).toBe(400);
  });

  it("rejects an unresolvable URL with a reason and stores nothing", async () => {
    const before = await env.DB.prepare(`SELECT COUNT(*) AS n FROM submissions`).first<{ n: number }>();
    const r = await postJson("/api/submit", { url: "https://definitely-not-real.invalid/" });
    expect(r.status).toBe(422);
    expect(r.json.message).toContain("No blyg or feed found");
    const after = await env.DB.prepare(`SELECT COUNT(*) AS n FROM submissions`).first<{ n: number }>();
    expect(after!.n).toBe(before!.n);
  });
});

// Inline scripts live inside TS template literals, which is a parser hazard the
// rest of the suite cannot see: an assertion about the HTML passes whether or
// not the <script> in it is valid JavaScript. blygger-spec learned this the
// hard way in session 19 — a shipped studio where every button was dead, with
// 400 green tests. The admin page's script is especially exposed because the
// page is gated, so no request-level test ever renders it.
describe("every inline script parses", () => {
  function assertParses(html: string, where: string) {
    const bodies = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(bodies.length, `${where}: no inline script`).toBeGreaterThan(0);
    bodies.forEach((b, i) => expect(() => new Function(b), `${where} script ${i}`).not.toThrow());
  }

  it("public page", async () => {
    assertParses(await (await get("/")).text(), "public");
  });

  it("admin queue (rendered directly — the route is gated)", async () => {
    const { adminPage } = await import("../src/pages.ts");
    assertParses(
      adminPage([
        {
          id: "x1",
          submitted_url: "https://a.example/",
          kind: "blyg",
          origin: "https://a.example/",
          title: "A",
          home_url: "https://a.example/",
          resolve_note: null,
          last_checked_at: null,
          last_ok_at: null,
          failing_since: null,
          health_note: null,
          flags: null,
          defect_since: null,
          protocol: "0.2",
          level: 2,
          generator: "x/1",
          item_ids: null,
          review_reason: null,
          warnings: null,
          contact: "someone@a.example",
          status: "pending",
          submitted_at: "2026-09-16T00:00:00Z",
          reviewed_at: null,
          admin_note: null,
        },
      ]),
      "admin",
    );
  });

  it("login page", async () => {
    const { loginPage } = await import("../src/pages.ts");
    // No script on the login page by design; assert that rather than skipping.
    expect(loginPage()).not.toContain("<script>");
  });
});

// A plain feed's name. Before this, `validateSubmission` returned `title: null`
// for every `rss` result, so the public list showed six feed rows as bare
// hostnames beside blyg rows showing their real names. The resolver never
// surfaced a title — status.md said it did, which was wrong — so the directory
// fetches the feed once more at submission time and reads its channel title.
describe("a plain feed gets a name, not a hostname", () => {
  const RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
    <title>Adventure Capital</title><link>https://ac.example/</link>
    <item><guid>1</guid><link>https://ac.example/one</link><title>One</title></item>
  </channel></rss>`;

  it("reads an RSS channel title", async () => {
    const v = await validateSubmission(
      "https://ac.example/feed.xml",
      stubFetch({ "https://ac.example/feed.xml": { body: RSS, type: "application/rss+xml" } }),
    );
    expect(v.kind).toBe("rss");
    expect(v.title).toBe("Adventure Capital");
    // Unchanged: the directory lists home pages, so a feed row points at the
    // feed's origin rather than at the XML.
    expect(v.homeUrl).toBe("https://ac.example/");
  });

  it("reads an Atom feed title", async () => {
    const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
      <title>Summer Lightning</title><id>urn:x</id>
      <entry><id>urn:1</id><link href="https://sl.example/one"/><title>One</title></entry>
    </feed>`;
    const v = await validateSubmission(
      "https://sl.example/atom.xml",
      stubFetch({ "https://sl.example/atom.xml": { body: atom, type: "application/atom+xml" } }),
    );
    expect(v.kind).toBe("rss");
    expect(v.title).toBe("Summer Lightning");
  });

  it("still lists the feed when it has no usable title", async () => {
    const untitled = `<?xml version="1.0"?><rss version="2.0"><channel>
      <link>https://x.example/</link>
      <item><guid>1</guid><link>https://x.example/one</link></item>
    </channel></rss>`;
    const v = await validateSubmission(
      "https://x.example/feed.xml",
      stubFetch({ "https://x.example/feed.xml": { body: untitled, type: "application/rss+xml" } }),
    );
    // A missing title is cosmetic. It must never cost the listing — the page
    // falls back to the hostname exactly as it did before.
    expect(v.kind).toBe("rss");
    expect(v.title).toBeNull();
  });

  it("does not adopt an item's title as the channel's", async () => {
    const noChannelTitle = `<?xml version="1.0"?><rss version="2.0"><channel>
      <link>https://y.example/</link>
      <item><guid>1</guid><link>https://y.example/one</link><title>A post, not a publication</title></item>
    </channel></rss>`;
    const v = await validateSubmission(
      "https://y.example/feed.xml",
      stubFetch({ "https://y.example/feed.xml": { body: noChannelTitle, type: "application/rss+xml" } }),
    );
    expect(v.title).toBeNull();
  });

  it("a blyg is unaffected — its name still comes from the manifest", async () => {
    const v = await validateSubmission(
      "https://b.example/",
      stubFetch({
        "https://b.example/blyg.json": {
          body: JSON.stringify({ blyg: "0.3", site: "https://b.example/", title: "A Blyg" }),
          type: "application/json",
        },
      }),
    );
    expect(v.kind).toBe("blyg");
    expect(v.title).toBe("A Blyg");
  });
});

// Automatic approval (session 29, Venkat: "make approvals automatic unless they
// need to be flagged for review due to potential security issues").
//
// The rule inverted: a submission that resolves cleanly and trips none of
// review.ts's checks is listed immediately. That makes these tests the gate
// itself — every case below is one where a listing could deceive or misdirect a
// reader, and a regression here publishes it instead of queuing it.
describe("block, warn, or clean", () => {
  // Venkat, session 29, after the first version held two harmless submissions:
  // "I'm not going to chase down harmless failures personally. Hold back should
  //  be for confirmed security issues. Others can be released with a warning."
  //
  // The line is CONFIRMED vs AMBIGUOUS, not severe vs mild. A reviewer cannot
  // tell a homograph domain from a legitimate non-Latin one, or a hijacked
  // manifest from a site that moved — so those warn. Only acts nobody performs
  // by accident block.
  const ok = (over: Partial<import("../src/validate.ts").Validated> = {}) => ({
    kind: "blyg" as const,
    origin: "https://clean.example/blyg/",
    title: "Clean Blyg",
    homeUrl: "https://clean.example/blyg/",
    note: null,
    ...over,
  });

  async function verdict(v: any) {
    const { reviewReason } = await import("../src/review.ts");
    return reviewReason({ submittedUrl: v.homeUrl ?? "https://clean.example/", validated: v });
  }

  it("a clean submission is listed with nothing to say", async () => {
    const r = await verdict(ok());
    expect(r.block).toBeNull();
    expect(r.warnings).toEqual([]);
  });

  it("a clean plain feed too", async () => {
    const r = await verdict(ok({ kind: "rss", title: "A Feed", origin: "https://feed.example/rss.xml" }));
    expect(r.block).toBeNull();
    expect(r.warnings).toEqual([]);
  });

  describe("blocked — nobody does these by accident", () => {
    it("credentials in the URL", async () => {
      const r = await verdict(ok({ homeUrl: "https://user:pw@creds.example/", origin: "https://creds.example/" }));
      expect(r.block).toContain("credentials");
    });

    it("a direction-override character in the title", async () => {
      // There is no innocent reason to put one in a display name; its only
      // effect is to make the name render as something it is not.
      const r = await verdict(ok({ title: "Innocent\u202Egnilb suoicilam" }));
      expect(r.block).toContain("direction-override");
    });

    // Nothing else. A mismatch onto a *listed* origin was blockable for about
    // an hour, until the first real row it met was an operator who had moved
    // hosts and left `site` pointing at their own old address — which the rule
    // could not tell from an impostor. See the warning case below.
  });

  describe("warned — listed anyway, and the operator is told", () => {
    it("a stale manifest site — including one pointing at another listing", async () => {
      // The [jdbb] case, exactly: an operator moved from an address that is
      // itself listed here and did not update `site`. Indistinguishable from
      // impersonation by inspection, overwhelmingly a move in practice, and
      // blocking it would queue people for migrating domains.
      const r = await verdict(
        ok({ note: "manifest asserts site https://old.example/blyg/, served from https://new.example/blyg/" }),
      );
      expect(r.block).toBeNull();
      expect(r.warnings.join(" ")).toContain("site");
    });

    it("plain HTTP", async () => {
      const r = await verdict(ok({ homeUrl: "http://insecure.example/", origin: "http://insecure.example/" }));
      expect(r.block).toBeNull();
      expect(r.warnings.join(" ")).toContain("TLS");
    });

    it("a private or loopback host — broken, not dangerous", async () => {
      const r = await verdict(ok({ homeUrl: "https://192.168.1.9/", origin: "https://192.168.1.9/" }));
      expect(r.block).toBeNull();
      expect(r.warnings.join(" ")).toMatch(/private|reach/);
    });

    it("a bare IP address", async () => {
      const r = await verdict(ok({ homeUrl: "https://93.184.216.34/", origin: "https://93.184.216.34/" }));
      expect(r.block).toBeNull();
      expect(r.warnings.join(" ")).toContain("bare IP");
    });

    it("an internationalised hostname — noted, never held", async () => {
      // Flagging every non-Latin-script publication for manual review would
      // make waiting the default for exactly one part of the world.
      const r = await verdict(ok({ homeUrl: "https://xn--80ak6aa92e.example/", origin: "https://xn--80ak6aa92e.example/" }));
      expect(r.block).toBeNull();
      expect(r.warnings.join(" ")).toContain("internationalised");
    });

    it("collects more than one when more than one applies", async () => {
      const r = await verdict(ok({ homeUrl: "http://192.168.1.9/", origin: "http://192.168.1.9/" }));
      expect(r.block).toBeNull();
      expect(r.warnings.length).toBeGreaterThan(1);
    });
  });

  it("lists a name another listing already uses — the domain is the discriminator", async () => {
    // "blyg as name is people setting lazy defaults… There can be 2 'Joe's
    // blyg' sites." The names that collide are unchosen defaults, which is the
    // reference client's defect to fix, not a stranger's to be queued for.
    expect((await verdict(ok({ title: "Joe's blyg" }))).block).toBeNull();
    expect((await verdict(ok({ title: "blyg" }))).block).toBeNull();
  });
});

describe("the decision is made in one place", () => {
  it("a flagged submission is stored pending, with its reason, and stays off the page", async () => {
    const { insertSubmission } = await import("../src/store.ts");
    const id = await insertSubmission(env.DB, {
      submittedUrl: "https://mirror.example/blyg/",
      kind: "blyg",
      origin: "https://mirror.example/blyg/",
      title: "Held Site",
      homeUrl: "https://mirror.example/blyg/",
      resolveNote: null,
      contact: null,
      reviewReason: "URL contains credentials",
      warnings: [],
    });
    const { getById } = await import("../src/store.ts");
    const row = await getById(env.DB, id);
    expect(row?.status).toBe("pending");
    expect(row?.review_reason).toContain("credentials");
    expect(await (await get("/")).text()).not.toContain("Held Site");
    await env.DB.prepare(`DELETE FROM submissions WHERE id = ?`).bind(id).run();
  });

  it("an unflagged submission is stored approved and appears at once", async () => {
    const { insertSubmission } = await import("../src/store.ts");
    const id = await insertSubmission(env.DB, {
      submittedUrl: "https://auto.example/blyg/",
      kind: "blyg",
      origin: "https://auto.example/blyg/",
      title: "Auto Listed",
      homeUrl: "https://auto.example/blyg/",
      resolveNote: null,
      contact: null,
      reviewReason: null,
      warnings: [],
    });
    const { getById } = await import("../src/store.ts");
    expect((await getById(env.DB, id))?.status).toBe("approved");
    expect(await (await get("/")).text()).toContain("Auto Listed");
    await env.DB.prepare(`DELETE FROM submissions WHERE id = ?`).bind(id).run();
  });

});

// Applying the rules to the queue that predates them (Venkat: "run this on any
// queued pending submissions"). The queue was held by the old blanket rule, not
// by findings about those rows — leaving it there would make the new policy a
// start date rather than a policy.
describe("rechecking the existing queue", () => {
  async function queue(rows: Array<Partial<Record<string, string>>>) {
    for (const r of rows) {
      await env.DB.prepare(
        `INSERT INTO submissions (id, submitted_url, kind, origin, title, home_url, resolve_note, status, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', '2026-09-16T00:00:00Z')`,
      )
        .bind(r.id, r.url, r.kind ?? "blyg", r.origin ?? r.url, r.title ?? null, r.home ?? r.url, r.note ?? null)
        .run();
    }
  }
  const clean = async () => env.DB.prepare(`DELETE FROM submissions WHERE id LIKE 'rc%'`).run();

  it("lists everything that is not an attack, recording warnings on the way", async () => {
    await queue([
      { id: "rc1", url: "https://good.example/blyg/", title: "Good One" },
      {
        id: "rc2",
        url: "https://moved.example/blyg/",
        title: "Moved House",
        note: "manifest asserts site https://old.example/blyg/, served from https://moved.example/blyg/",
      },
      { id: "rc3", url: "http://plain.example/", title: "Plaintext" },
    ]);

    const cookie = await login();
    const res = await postJson("/admin/recheck", {}, cookie);
    expect(res.status).toBe(200);
    const out = res.json;
    // All three list: none is a confirmed attack. Two carry warnings.
    expect(out.checked).toBe(3);
    expect(out.listed).toBe(3);
    expect(out.held).toHaveLength(0);
    expect(out.warned).toBe(2);

    const { getById } = await import("../src/store.ts");
    expect((await getById(env.DB, "rc1"))?.status).toBe("approved");
    expect(JSON.parse((await getById(env.DB, "rc1"))?.warnings ?? "[]")).toEqual([]);
    expect((await getById(env.DB, "rc2"))?.status).toBe("approved");
    expect(JSON.parse((await getById(env.DB, "rc2"))?.warnings ?? "[]").join(" ")).toContain("site");
    expect(JSON.parse((await getById(env.DB, "rc3"))?.warnings ?? "[]").join(" ")).toContain("TLS");

    const html = await (await get("/")).text();
    expect(html).toContain("Good One");
    expect(html).toContain("Moved House");
    await clean();
  });

  it("never touches a row a human already decided", async () => {
    await queue([{ id: "rc4", url: "https://decided.example/", title: "Decided" }]);
    await env.DB.prepare(`UPDATE submissions SET status = 'rejected' WHERE id = 'rc4'`).run();
    const cookie = await login();
    await postJson("/admin/recheck", {}, cookie);
    const { getById } = await import("../src/store.ts");
    // A recheck that could reopen a rejection would undo the reviewer's work
    // in bulk, silently.
    expect((await getById(env.DB, "rc4"))?.status).toBe("rejected");
    await clean();
  });

  it("lists two submissions sharing a name, because the domains differ", async () => {
    await queue([
      { id: "rc5", url: "https://first.example/", title: "Same Name" },
      { id: "rc6", url: "https://second.example/", title: "Same Name" },
    ]);
    const cookie = await login();
    const out = (await postJson("/admin/recheck", {}, cookie)).json;
    expect(out.listed).toBe(2);
    expect(out.held).toHaveLength(0);
    await clean();
  });

  it("is idempotent — a second run changes nothing", async () => {
    await queue([{ id: "rc7", url: "https://idem.example/", title: "Idempotent" }]);
    const cookie = await login();
    await postJson("/admin/recheck", {}, cookie);
    const second = (await postJson("/admin/recheck", {}, cookie)).json;
    expect(second.checked).toBe(0);
    await clean();
  });

  it("refuses without a session", async () => {
    const res = await postJson("/admin/recheck", {});
    expect(res.status).toBe(401);
  });
});

// ── Session 38: the listings feed, the health pass, and blogroll sightings ──

const MANIFEST = (site: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ blyg: "0.3", level: 1, site, title: "Healthy Blyg", feed: "feed.xml", items: "items/index.json", ...extra });

describe("listings.xml", () => {
  it("is Atom, blygs only, keyed by origin, and advertised from the page", async () => {
    const { insertSubmission } = await import("../src/store.ts");
    const a = await insertSubmission(env.DB, {
      submittedUrl: "https://atom.example/", kind: "blyg", origin: "https://atom.example/", title: "Atom Blyg",
      homeUrl: "https://atom.example/", resolveNote: null, contact: null, reviewReason: null, warnings: [],
    });
    const b = await insertSubmission(env.DB, {
      submittedUrl: "https://atomfeed.example/rss", kind: "rss", origin: "https://atomfeed.example/rss", title: "Atom Legacy",
      homeUrl: "https://atomfeed.example/", resolveNote: null, contact: null, reviewReason: null, warnings: [],
    });
    const res = await get("/listings.xml");
    expect(res.headers.get("content-type")).toContain("application/atom+xml");
    const xml = await res.text();
    expect(xml).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
    expect(xml).toContain("<id>https://atom.example/</id>");
    expect(xml).toContain('rel="related" type="application/rss+xml" href="https://atom.example/feed.xml"');
    expect(xml).not.toContain("Atom Legacy");
    expect(await (await get("/")).text()).toContain('type="application/atom+xml"');
    for (const id of [a, b]) await env.DB.prepare(`DELETE FROM submissions WHERE id = ?`).bind(id).run();
  });
});

describe("dormancy", () => {
  it("only a 72-hour run of failures is dormant", async () => {
    const { isDormant } = await import("../src/health.ts");
    const now = new Date("2026-10-06T12:00:00Z");
    expect(isDormant(null, now)).toBe(false);
    expect(isDormant("2026-10-04T12:00:01Z", now)).toBe(false);
    expect(isDormant("2026-10-03T12:00:00Z", now)).toBe(true);
  });

  it("a dormant blyg leaves the OPML and the feed but stays on the page", async () => {
    const { blygsOpml, listingsAtom, publicPage } = await import("../src/pages.ts");
    const rows = [
      { kind: "blyg" as const, title: "Alive", home_url: "https://alive.example/", origin: "https://alive.example/",
        listed_at: "2026-10-01T00:00:00Z", failing_since: "2026-10-06T00:00:00Z", flags: null, defect_since: null, protocol: null, level: null, generator: null },
      { kind: "blyg" as const, title: "Gone", home_url: "https://gone.example/", origin: "https://gone.example/",
        listed_at: "2026-10-01T00:00:00Z", failing_since: "2026-09-01T00:00:00Z", flags: null, defect_since: null, protocol: null, level: null, generator: null },
    ];
    const now = new Date("2026-10-06T12:00:00Z");
    expect(blygsOpml(rows, now)).toContain("Alive");
    expect(blygsOpml(rows, now)).not.toContain("Gone");
    expect(listingsAtom(rows, now)).not.toContain("Gone");
    const page = publicPage(rows, now);
    expect(page).toContain("Gone");
    expect(page).toContain(">withdrawn from feeds<");
    // Alive has been failing 12 hours: not news yet.
    const alive = page.slice(page.indexOf("Alive"), page.indexOf("</li>", page.indexOf("Alive")));
    expect(alive).not.toContain('class="health"');
  });
});

describe("the health pass", () => {
  it("records success, failure, recovery, and blogroll sightings; never delists", async () => {
    const { runHealthPass, listUnlistedBlygs } = await import("../src/health.ts");
    const { insertSubmission, getById } = await import("../src/store.ts");
    await env.DB.prepare(`DELETE FROM submissions`).run();
    const id = await insertSubmission(env.DB, {
      submittedUrl: "https://h.example/", kind: "blyg", origin: "https://h.example/", title: "Healthy Blyg",
      homeUrl: "https://h.example/", resolveNote: null, contact: null, reviewReason: null, warnings: ["stale"],
    });

    const up = stubFetch({
      "https://h.example/": { body: '<link rel="blyg" href="/blyg.json">' },
      "https://h.example/blyg.json": { body: MANIFEST("https://h.example/", { blogroll: "blogroll.opml" }), type: "application/json" },
      "https://h.example/blogroll.opml": {
        body: `<?xml version="1.0"?><opml version="2.0"><head/><body>
          <outline text="Folder"><outline type="rss" text="Friend" xmlUrl="https://friend.example/feed.xml" htmlUrl="https://friend.example/"/></outline>
          <outline type="rss" text="Self" xmlUrl="https://h.example/feed.xml"/>
        </body></opml>`,
      },
      "https://friend.example/feed.xml": {
        body: `<?xml version="1.0"?><rss version="2.0" xmlns:blyg="https://blygger.org/ns/0.1"><channel><title>Friend</title><blyg:manifest>https://friend.example/blyg.json</blyg:manifest></channel></rss>`,
        type: "application/rss+xml",
      },
      "https://friend.example/blyg.json": { body: MANIFEST("https://friend.example/"), type: "application/json" },
      "https://h.example/feed.xml": {
        body: `<?xml version="1.0"?><rss version="2.0" xmlns:blyg="https://blygger.org/ns/0.1"><channel><title>H</title><blyg:manifest>https://h.example/blyg.json</blyg:manifest></channel></rss>`,
        type: "application/rss+xml",
      },
    });

    const r1 = await runHealthPass(env.DB, up as any, new Date("2026-10-01T00:00:00Z"));
    expect(r1.checked).toEqual([{ id, ok: true, note: null }]);
    expect(r1.sightingsRecorded).toBe(2);
    let row = await getById(env.DB, id);
    expect(row?.last_ok_at).toBe("2026-10-01T00:00:00.000Z");
    expect(row?.failing_since).toBeNull();
    expect(row?.warnings).toBe("[]"); // a fixed site stops being marked

    // The friend resolves as an unlisted blyg; the listing's own feed does not count.
    const unlisted = await listUnlistedBlygs(env.DB);
    expect(unlisted.map((u) => u.origin)).toEqual(["https://friend.example/"]);
    expect(await (await get("/")).text()).not.toContain("friend.example");

    const down = stubFetch({});
    await runHealthPass(env.DB, down as any, new Date("2026-10-02T00:00:00Z"));
    await runHealthPass(env.DB, down as any, new Date("2026-10-03T00:00:00Z"));
    row = await getById(env.DB, id);
    expect(row?.failing_since).toBe("2026-10-02T00:00:00.000Z"); // the first failure, kept
    expect(row?.status).toBe("approved");
    expect(row?.health_note).toContain("resolution failed");

    await runHealthPass(env.DB, up as any, new Date("2026-10-06T00:00:00Z"));
    row = await getById(env.DB, id);
    expect(row?.failing_since).toBeNull();
    expect(row?.health_note).toBeNull();

    await env.DB.prepare(`DELETE FROM submissions`).run();
    await env.DB.prepare(`DELETE FROM sightings`).run();
  });

  it("parseBlogroll skips non-http entries and walks folders", async () => {
    const { parseBlogroll } = await import("../src/health.ts");
    const got = parseBlogroll(`<opml version="2.0"><body>
      <outline text="A" xmlUrl="https://a.example/feed"/>
      <outline text="Bad" xmlUrl="javascript:alert(1)"/>
      <outline text="F"><outline text="B" xmlUrl="http://b.example/rss"/></outline>
    </body></opml>`);
    expect(got.map((g) => g.feedUrl)).toEqual(["https://a.example/feed", "http://b.example/rss"]);
    expect(parseBlogroll("not xml at all <<<")).toEqual([]);
  });
});

describe("public health marks and withdrawal (migration 0006)", () => {
  const base = { kind: "blyg" as const, title: "T", home_url: "https://t.example/", origin: "https://t.example/",
    listed_at: "2026-09-01T00:00:00Z", failing_since: null, protocol: null, level: null, generator: null };
  const now = new Date("2026-10-06T12:00:00Z");

  it("defects are marked at once and withdraw after 14 days; info codes are never public", async () => {
    const { publicMarks, isWithdrawn } = await import("../src/health.ts");
    const fresh = { ...base, flags: '["site-mismatch","idn"]', defect_since: "2026-10-05T00:00:00Z" };
    expect(publicMarks(fresh, now).map((m) => m.label)).toEqual(["manifest site mismatch"]);
    expect(isWithdrawn(fresh, now)).toBe(false);
    const old = { ...fresh, defect_since: "2026-09-20T00:00:00Z" };
    expect(isWithdrawn(old, now)).toBe(true);
    expect(publicMarks(old, now).map((m) => m.label)).toEqual(["manifest site mismatch", "withdrawn from feeds"]);
    const infoOnly = { ...base, flags: '["idn","ip-literal"]', defect_since: null };
    expect(publicMarks(infoOnly, now)).toEqual([]);
  });

  it("unreachable is shown after 24 hours and replaces stale flags", async () => {
    const { publicMarks } = await import("../src/health.ts");
    const r = { ...base, failing_since: "2026-10-05T00:00:00Z", flags: '["plain-http"]', defect_since: "2026-10-01T00:00:00Z" };
    expect(publicMarks(r, now).map((m) => m.label)).toEqual(["unreachable"]);
  });

  it("the re-check records defects, keeps their start, clears them when fixed", async () => {
    const { runHealthPass } = await import("../src/health.ts");
    const { insertSubmission, getById } = await import("../src/store.ts");
    await env.DB.prepare(`DELETE FROM submissions`).run();
    const id = await insertSubmission(env.DB, {
      submittedUrl: "https://d.example/", kind: "blyg", origin: "https://d.example/", title: "D",
      homeUrl: "https://d.example/", resolveNote: null, contact: null, reviewReason: null, warnings: [],
    });
    const site = (asserted: string) => stubFetch({
      "https://d.example/": { body: '<link rel="blyg" href="/blyg.json">' },
      "https://d.example/blyg.json": { body: MANIFEST(asserted), type: "application/json" },
    });
    await runHealthPass(env.DB, site("https://elsewhere.example/") as any, new Date("2026-10-01T00:00:00Z"));
    await runHealthPass(env.DB, site("https://elsewhere.example/") as any, new Date("2026-10-02T00:00:00Z"));
    let row = await getById(env.DB, id);
    expect(JSON.parse(row!.flags!)).toEqual(["site-mismatch"]);
    expect(row?.defect_since).toBe("2026-10-01T00:00:00.000Z");
    expect(await (await get("/")).text()).toContain(">manifest site mismatch<");

    await runHealthPass(env.DB, site("https://d.example/") as any, new Date("2026-10-03T00:00:00Z"));
    row = await getById(env.DB, id);
    expect(row?.flags).toBe("[]");
    expect(row?.defect_since).toBeNull();
    expect(await (await get("/")).text()).not.toContain('class="health"');
    await env.DB.prepare(`DELETE FROM submissions`).run();
  });

  it("a listing that moves from http to https follows, and loses its mark", async () => {
    const { runHealthPass } = await import("../src/health.ts");
    const { insertSubmission, getById } = await import("../src/store.ts");
    await env.DB.prepare(`DELETE FROM submissions`).run();
    const id = await insertSubmission(env.DB, {
      submittedUrl: "http://tls.example/", kind: "blyg", origin: "http://tls.example/", title: "TLS",
      homeUrl: "http://tls.example/", resolveNote: null, contact: null, reviewReason: null, warnings: [],
    });
    // The http origin redirects: the final URL the resolver sees is https.
    const redirecting = async (url: string): Promise<FetchResult> => {
      const target = url.replace(/^http:/, "https:");
      return stubFetch({
        "https://tls.example/": { body: '<link rel="blyg" href="/blyg.json">' },
        "https://tls.example/blyg.json": { body: MANIFEST("https://tls.example/"), type: "application/json" },
      })(target).then((r) => ({ ...r, url: target }));
    };
    await runHealthPass(env.DB, redirecting as any, new Date("2026-10-01T00:00:00Z"));
    const row = await getById(env.DB, id);
    expect(row?.origin).toBe("https://tls.example/");
    expect(row?.home_url).toBe("https://tls.example/");
    expect(row?.flags).toBe("[]");
    await env.DB.prepare(`DELETE FROM submissions`).run();
  });
});

describe("protocol census (migration 0007)", () => {
  it("reads the manifest defensively", async () => {
    const { manifestCensus } = await import("../src/validate.ts");
    expect(manifestCensus({ blyg: "0.3", level: 2, generator: "blygger-studio/0.32.1" }))
      .toEqual({ protocol: "0.3", level: 2, generator: "blygger-studio/0.32.1" });
    expect(manifestCensus({ blyg: "<script>", level: "2", generator: "" }))
      .toEqual({ protocol: null, level: null, generator: null });
    expect(manifestCensus({ blyg: 0.2 }).protocol).toBe("0.2");
  });

  it("is stored at submission, refreshed by the re-check, and shown beside the blyg", async () => {
    const { runHealthPass } = await import("../src/health.ts");
    const { insertSubmission, getById } = await import("../src/store.ts");
    await env.DB.prepare(`DELETE FROM submissions`).run();
    const id = await insertSubmission(env.DB, {
      submittedUrl: "https://v.example/", kind: "blyg", origin: "https://v.example/", title: "Versioned",
      homeUrl: "https://v.example/", resolveNote: null, contact: null, reviewReason: null, warnings: [],
      census: { protocol: "0.2", level: 1, generator: "old/1.0" },
    });
    let page = await (await get("/")).text();
    expect(page).toContain('class="ver behind"');
    expect(page).toContain("v0.2");

    await runHealthPass(env.DB, stubFetch({
      "https://v.example/": { body: '<link rel="blyg" href="/blyg.json">' },
      "https://v.example/blyg.json": {
        body: MANIFEST("https://v.example/", { blyg: "0.3", level: 2, generator: "new/2.0" }), type: "application/json",
      },
    }) as any, new Date("2026-10-01T00:00:00Z"));
    const row = await getById(env.DB, id);
    expect([row?.protocol, row?.level, row?.generator]).toEqual(["0.3", 2, "new/2.0"]);
    page = await (await get("/")).text();
    expect(page).toContain('<span class="ver" title="protocol 0.3 · level 2 · generator: new/2.0">v0.3</span>');
    await env.DB.prepare(`DELETE FROM submissions`).run();
  });
});

describe("duplicates by content (migration 0008)", () => {
  it("a second address for the same blyg is refused at submission, naming the first", async () => {
    await env.DB.prepare(`DELETE FROM submissions`).run();
    const first = await postJson("/api/submit", { url: "https://canonical.fixture.test/" });
    expect(first.status).toBe(200);
    expect(first.json.message).toContain("Listed");

    const second = await postJson("/api/submit", { url: "https://mirror.fixture.test/", contact: "op@fixture.test" });
    expect(second.status).toBe(409);
    expect(second.json.duplicate_of).toBe("https://canonical.fixture.test/");
    expect(second.json.message).toContain("same blyg as https://canonical.fixture.test/");

    const { results } = await env.DB.prepare(`SELECT origin, contact FROM submissions`).all<{ origin: string; contact: string | null }>();
    expect(results.map((r) => r.origin)).toEqual(["https://canonical.fixture.test/"]);
    // The refused submission's contact lands on the listing it duplicates, if that had none.
    expect(results[0].contact).toBe("op@fixture.test");
  });

  it("a different blyg is not a duplicate", async () => {
    const r = await postJson("/api/submit", { url: "https://other.fixture.test/" });
    expect(r.status).toBe(200);
  });

  it("a rejected listing does not block, and re-submitting a rejected address says so", async () => {
    await env.DB.prepare(`UPDATE submissions SET status = 'rejected' WHERE origin = 'https://canonical.fixture.test/'`).run();
    const again = await postJson("/api/submit", { url: "https://canonical.fixture.test/" });
    expect(again.json.message).toContain("taken out of the directory");
    const mirror = await postJson("/api/submit", { url: "https://mirror.fixture.test/" });
    expect(mirror.status).toBe(200);
    await env.DB.prepare(`DELETE FROM submissions`).run();
  });

  it("the re-check notes an existing duplicate pair for the admin and delists neither", async () => {
    const { insertSubmission, getById } = await import("../src/store.ts");
    const { runHealthPass, timedFetch } = await import("../src/health.ts");
    const mk = (host: string) => insertSubmission(env.DB, {
      submittedUrl: `https://${host}/`, kind: "blyg", origin: `https://${host}/`, title: "Fixture Blyg",
      homeUrl: `https://${host}/`, resolveNote: null, contact: null, reviewReason: null, warnings: [],
    });
    const a = await mk("canonical.fixture.test");
    const b = await mk("mirror.fixture.test");
    // timedFetch is the production fetch; the outbound fixture answers it.
    await runHealthPass(env.DB, timedFetch, new Date("2026-10-06T00:00:00Z"));
    await runHealthPass(env.DB, timedFetch, new Date("2026-10-06T01:00:00Z"));
    const ra = await getById(env.DB, a);
    const rb = await getById(env.DB, b);
    expect([ra?.status, rb?.status]).toEqual(["approved", "approved"]);
    expect(rb?.health_note).toContain("same items as https://canonical.fixture.test/ (2 shared)");
    expect(JSON.parse(ra!.item_ids!)).toHaveLength(2);
    await env.DB.prepare(`DELETE FROM submissions`).run();
  });
});

describe("names follow the site (session 38)", () => {
  it("the re-check takes a renamed title, and refuses a deceptive one", async () => {
    const { insertSubmission, getById } = await import("../src/store.ts");
    const { runHealthPass } = await import("../src/health.ts");
    await env.DB.prepare(`DELETE FROM submissions`).run();
    const id = await insertSubmission(env.DB, {
      submittedUrl: "https://n.example/", kind: "blyg", origin: "https://n.example/", title: "Old Name",
      homeUrl: "https://n.example/", resolveNote: null, contact: null, reviewReason: null, warnings: [],
    });
    const named = (title: string) => stubFetch({
      "https://n.example/": { body: '<link rel="blyg" href="/blyg.json">' },
      "https://n.example/blyg.json": { body: MANIFEST("https://n.example/", { title }), type: "application/json" },
    });
    await runHealthPass(env.DB, named("New Name") as any, new Date("2026-10-01T00:00:00Z"));
    let row = await getById(env.DB, id);
    expect(row?.title).toBe("New Name");
    expect(row?.health_note).toContain('renamed from "Old Name"');
    expect(await (await get("/")).text()).toContain("New Name");

    await runHealthPass(env.DB, named("Evil\u202Eeman") as any, new Date("2026-10-02T00:00:00Z"));
    row = await getById(env.DB, id);
    expect(row?.title).toBe("New Name");
    expect(row?.health_note).toContain("new title not taken");
    await env.DB.prepare(`DELETE FROM submissions`).run();
  });
});
