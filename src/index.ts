// blygger.com — a directory of blygs. One public page, one admin page.
//
// Deliberately small surface: GET / lists approved entries, POST /api/submit
// accepts a URL and resolves it, and everything under /admin is owner-gated.
// Nothing is public until a human approves it.

import { Hono } from "hono";
import type { Context } from "hono";
import { checkPassword, clearSessionCookie, issueSessionCookie, verifySession } from "./auth.ts";
import { adminPage, loginPage, publicPage } from "./pages.ts";
import { getByOrigin, insertSubmission, listApproved, listForReview, setStatus, getById } from "./store.ts";
import type { Env } from "./types.ts";
import { validateSubmission } from "./validate.ts";

const app = new Hono<{ Bindings: Env }>();

// Cache the public page briefly. Short on purpose: an approval should show up
// while the person who made it is still looking at the page.
const PUBLIC_CACHE = "public, max-age=60";

app.get("/", async (c) => {
  const rows = await listApproved(c.env.DB);
  return c.html(publicPage(rows), 200, { "cache-control": PUBLIC_CACHE });
});

/**
 * Submission. Open to anyone by design — the gate is approval, not submission.
 *
 * Resolution happens inline rather than on a queue: it is bounded to six
 * fetches by the algorithm itself (decision #17), and doing it here means the
 * submitter finds out immediately whether their blyg is discoverable, which is
 * the single most useful thing this endpoint can tell them.
 */
app.post("/api/submit", async (c) => {
  const body = await c.req.json<{ url?: string }>().catch(() => ({}) as { url?: string });
  const url = (body.url ?? "").trim();
  if (!url) return c.json({ message: "Give us a URL." }, 400);
  if (url.length > 2048) return c.json({ message: "That URL is implausibly long." }, 400);

  const v = await validateSubmission(url);

  if (v.kind === "failure") {
    // Not stored. A submission we could not resolve has no origin, so it cannot
    // be deduped and would just fill the queue — and the submitter is better
    // served by being told now, with the reason.
    return c.json(
      {
        message:
          "We couldn't find a blyg or a feed there. Check the URL resolves publicly, " +
          "or submit your feed URL directly.",
        detail: v.note,
      },
      422,
    );
  }

  if (v.origin) {
    const existing = await getByOrigin(c.env.DB, v.origin);
    if (existing) {
      return c.json({
        message:
          existing.status === "approved"
            ? "Already listed — thanks."
            : "Already submitted; it's in the queue.",
      });
    }
  }

  await insertSubmission(c.env.DB, {
    submittedUrl: url,
    kind: v.kind,
    origin: v.origin,
    title: v.title,
    homeUrl: v.homeUrl,
    resolveNote: v.note,
  });

  return c.json({
    message:
      v.kind === "blyg"
        ? "Resolved as a blyg. Queued for review — thanks."
        : "Resolved as a feed (not a blyg). Queued for review — thanks.",
  });
});

// ── Admin ──────────────────────────────────────────────────────────────────

async function requireOwner(c: Context<{ Bindings: Env }>): Promise<boolean> {
  return verifySession(c.env, c.req.header("cookie"));
}

app.get("/admin", async (c) => {
  if (!(await requireOwner(c))) return c.html(loginPage());
  return c.html(adminPage(await listForReview(c.env.DB)));
});

app.post("/admin/login", async (c) => {
  const form = await c.req.parseBody();
  const password = String(form.password ?? "");
  if (!(await checkPassword(c.env, password))) return c.html(loginPage(true), 401);
  c.header("set-cookie", await issueSessionCookie(c.env));
  return c.redirect("/admin", 303);
});

app.post("/admin/logout", async (c) => {
  c.header("set-cookie", clearSessionCookie());
  return c.redirect("/", 303);
});

app.post("/admin/review/:id", async (c) => {
  if (!(await requireOwner(c))) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  const { status, note } = await c.req.json<{ status?: string; note?: string }>().catch(() => ({}) as never);
  if (status !== "approved" && status !== "rejected" && status !== "pending") {
    return c.json({ error: "bad status" }, 400);
  }
  if (!(await getById(c.env.DB, id))) return c.json({ error: "not found" }, 404);
  await setStatus(c.env.DB, id, status, note);
  return c.json({ ok: true });
});

export default app;
