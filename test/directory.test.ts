// The directory's whole contract: nothing is public until approved, submissions
// are resolved with the real resolver, and the admin surface is actually gated.

import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
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
    expect(html).toContain("Nothing listed yet.");
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
    expect(r.json.message).toContain("couldn't find");
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

  async function verdict(v: any, listedOrigins?: Set<string>) {
    const { reviewReason } = await import("../src/review.ts");
    return reviewReason({ submittedUrl: v.homeUrl ?? "https://clean.example/", validated: v, listedOrigins });
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

    it("a manifest claiming an origin that is already someone else's listing", async () => {
      const r = await verdict(
        ok({ note: "manifest asserts site https://neighbour.example/blyg/, served from https://impostor.example/blyg/" }),
        new Set(["https://neighbour.example/"]),
      );
      expect(r.block).toContain("another listing here");
    });
  });

  describe("warned — listed anyway, and the operator is told", () => {
    it("a stale manifest site that names nobody here", async () => {
      // The [jdbb] case: an operator moved domains and did not update `site`.
      // Ambiguous by nature, harmless in fact, and not ours to adjudicate.
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
