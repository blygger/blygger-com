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

describe("nothing is public until approved", () => {
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
