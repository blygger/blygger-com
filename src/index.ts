// blygger.com — a directory of blygs. One public page, one admin page.
//
// Deliberately small surface: GET / lists approved entries, POST /api/submit
// accepts a URL and resolves it, and everything under /admin is owner-gated.
//
// **Listing is automatic** as of session 29: a submission that resolves cleanly
// and trips none of `review.ts`'s checks appears immediately, and the queue is
// for the ones that could deceive or misdirect a reader. The gate used to be a
// human on every row, which was right at five entries and became the bottleneck
// on a thing whose point is that anyone can join.

import { Hono } from "hono";
import type { Context } from "hono";
import { checkPassword, clearSessionCookie, issueSessionCookie, verifySession } from "./auth.ts";
import { adminPage, loginPage, publicPage } from "./pages.ts";
import { applyRecheck, getByOrigin, insertSubmission, listApproved, listForReview, listPending, setContactIfEmpty, setStatus, getById } from "./store.ts";
import { reviewReason } from "./review.ts";
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
  type SubmitBody = { url?: string; contact?: string };
  const body = await c.req.json<SubmitBody>().catch(() => ({}) as SubmitBody);
  const url = (body.url ?? "").trim();
  if (!url) return c.json({ message: "Give us a URL." }, 400);
  if (url.length > 2048) return c.json({ message: "That URL is implausibly long." }, 400);
  // Optional and unvalidated beyond a length cap and whitespace: an email, a
  // handle, a contact page — all of them fine. The purpose is a channel for a
  // security release (migration 0002), not a verified identity, and demanding a
  // format is how a courtesy field becomes a reason not to fill it in.
  const contact = (body.contact ?? "").replace(/\s+/g, " ").trim().slice(0, 200) || null;

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
      // A duplicate that brings a contact is worth something even though the
      // listing is not: it is the only way an already-listed operator can give
      // us one. Filled only when empty — a stranger re-submitting someone
      // else's blyg must not be able to replace their contact with their own.
      if (contact) await setContactIfEmpty(c.env.DB, existing.id, contact);
      return c.json({
        message:
          existing.status === "approved"
            ? "Already listed — thanks."
            : "Already submitted; it's in the queue.",
      });
    }
  }

  const { block, warnings } = reviewReason({ submittedUrl: url, validated: v });

  await insertSubmission(c.env.DB, {
    submittedUrl: url,
    kind: v.kind,
    origin: v.origin,
    title: v.title,
    homeUrl: v.homeUrl,
    resolveNote: v.note,
    contact,
    reviewReason: block,
    warnings,
  });

  const what = v.kind === "blyg" ? "Resolved as a blyg" : "Resolved as a feed (not a blyg)";
  // Warnings go back to the submitter at the moment they submit, which is the
  // only moment we reliably have their attention — and they are things only the
  // operator can fix. Listing is not withheld for them.
  return c.json({
    message: block ? `${what}. Held for review — thanks.` : `${what}. Listed — thanks.`,
    detail: block ?? undefined,
    warnings,
    listed: !block,
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

/**
 * Re-run the listing rules over everything still queued.
 *
 * The queue predates automatic listing: every row in it was held by the old
 * blanket "a human looks at everything" rule, not by a finding about that row.
 * Leaving them there would mean the new policy applies only to submissions that
 * happen to arrive after it shipped, which is not a policy, it is a start date.
 *
 * Idempotent and re-runnable, which is why this is an endpoint rather than a
 * one-off script: the rules in `review.ts` will change, and when they do this is
 * how the queue is brought back into agreement with them.
 *
 * It re-decides **only** rows that are still `pending`, and only from what was
 * already stored — no refetching, so a recheck cannot be steered by what a
 * third-party server returns today. A row whose flag still stands keeps its
 * place in the queue and gains the reason.
 */
app.post("/admin/recheck", async (c) => {
  if (!(await requireOwner(c))) return c.json({ error: "unauthorized" }, 401);
  const pending = await listPending(c.env.DB);
  const listed: string[] = [];
  const held: { id: string; title: string | null; reason: string }[] = [];
  let warned = 0;

  for (const row of pending) {
    const { block, warnings } = reviewReason({
      submittedUrl: row.submitted_url,
      validated: {
        kind: (row.kind ?? "failure") as "blyg" | "rss" | "failure",
        origin: row.origin,
        title: row.title,
        homeUrl: row.home_url,
        note: row.resolve_note,
      },
    });
    await applyRecheck(c.env.DB, row.id, block, warnings);
    if (block) {
      held.push({ id: row.id, title: row.title, reason: block });
    } else {
      listed.push(row.id);
      if (warnings.length) warned++;
    }
  }

  return c.json({ ok: true, checked: pending.length, listed: listed.length, warned, held });
});

export default app;
