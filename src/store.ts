// Every D1 query the directory makes. Kept in one file so the public surface
// (one query, approved-only) is obvious and cannot accidentally widen.

import type { PublicRow, SubmissionRow } from "./types.ts";
import { newId, nowIso } from "./util.ts";

/**
 * The public listing. `status = 'approved'` is not a filter applied by a caller
 * — it is baked in here, so there is no code path that lists a pending row to
 * the public page.
 *
 * The columns are named rather than `SELECT *` for the same reason: since
 * migration 0002 the table carries an operator contact, and a public query that
 * selects everything hands private data to a renderer and trusts it not to use
 * it. Add a public field here deliberately or it is not public.
 */
export async function listApproved(db: D1Database): Promise<PublicRow[]> {
  const { results } = await db
    .prepare(
      `SELECT kind, title, home_url, origin, failing_since, flags, defect_since, protocol, level, generator,
              COALESCE(reviewed_at, submitted_at) AS listed_at FROM submissions
       WHERE status = 'approved' AND home_url IS NOT NULL
       ORDER BY submitted_at DESC`,
    )
    .all<PublicRow>();
  return results ?? [];
}

export async function listForReview(db: D1Database): Promise<SubmissionRow[]> {
  const { results } = await db
    .prepare(`SELECT * FROM submissions ORDER BY status = 'pending' DESC, submitted_at DESC`)
    .all<SubmissionRow>();
  return results ?? [];
}

/** Rows still waiting on a human — the input to a recheck. */
export async function listPending(db: D1Database): Promise<SubmissionRow[]> {
  const { results } = await db
    .prepare(`SELECT * FROM submissions WHERE status = 'pending' ORDER BY submitted_at ASC`)
    .all<SubmissionRow>();
  return results ?? [];
}

/**
 * Apply a recheck verdict to a queued row: approve it, or leave it queued with
 * the reason now recorded.
 *
 * Guarded on `status = 'pending'` in SQL rather than by the caller checking
 * first. A recheck is a bulk operation over rows a human may be reviewing at the
 * same moment, and the one thing it must never do is reopen or re-approve
 * something already decided.
 */
export async function applyRecheck(
  db: D1Database,
  id: string,
  reason: string | null,
  warnings: string[],
): Promise<void> {
  const json = JSON.stringify(warnings);
  if (reason) {
    await db
      .prepare(`UPDATE submissions SET review_reason = ?, warnings = ? WHERE id = ? AND status = 'pending'`)
      .bind(reason, json, id)
      .run();
    return;
  }
  await db
    .prepare(
      `UPDATE submissions SET status = 'approved', reviewed_at = ?, review_reason = NULL, warnings = ?
       WHERE id = ? AND status = 'pending'`,
    )
    .bind(nowIso(), json, id)
    .run();
}

export async function getByOrigin(db: D1Database, origin: string): Promise<SubmissionRow | null> {
  return db.prepare(`SELECT * FROM submissions WHERE origin = ?`).bind(origin).first<SubmissionRow>();
}

export async function getById(db: D1Database, id: string): Promise<SubmissionRow | null> {
  return db.prepare(`SELECT * FROM submissions WHERE id = ?`).bind(id).first<SubmissionRow>();
}

export interface NewSubmission {
  submittedUrl: string;
  kind: "blyg" | "rss" | "failure";
  origin: string | null;
  title: string | null;
  homeUrl: string | null;
  resolveNote: string | null;
  contact: string | null;
  /** A confirmed attack; `null` lists it. The only thing that keeps a row out. */
  reviewReason: string | null;
  /** Ambiguous findings, shown to the operator. Listed regardless. */
  warnings: string[];
  /** What a blyg's manifest declares (migration 0007); omitted for feeds. */
  census?: { protocol: string | null; level: number | null; generator: string | null };
  /** Archive-index item ids (migration 0008); omitted or null when unread. */
  itemIds?: string[] | null;
}

/**
 * Insert, and decide publication in the same statement.
 *
 * `status` is computed from `reviewReason` here rather than passed in, so there
 * is exactly one place that can put a row into `approved` at submission time and
 * it is the place that also records why it did. A caller cannot approve a row by
 * forgetting to set a flag.
 */
export async function insertSubmission(db: D1Database, s: NewSubmission): Promise<string> {
  const id = newId();
  const status = s.reviewReason ? "pending" : "approved";
  await db
    .prepare(
      `INSERT INTO submissions
         (id, submitted_url, kind, origin, title, home_url, resolve_note, status, submitted_at, contact, review_reason, warnings,
          protocol, level, generator, item_ids)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, s.submittedUrl, s.kind, s.origin, s.title, s.homeUrl, s.resolveNote, status, nowIso(), s.contact, s.reviewReason, JSON.stringify(s.warnings),
      s.census?.protocol ?? null, s.census?.level ?? null, s.census?.generator ?? null,
      s.itemIds?.length ? JSON.stringify(s.itemIds) : null)
    .run();
  return id;
}

/**
 * Record a contact on a listing that already exists. A re-submission is the only
 * way an operator can reach this table at all, so a second submission carrying a
 * contact is them answering a question they were not asked the first time — it
 * fills an empty field and never overwrites one.
 */
export async function setContactIfEmpty(db: D1Database, id: string, contact: string): Promise<void> {
  await db
    .prepare(`UPDATE submissions SET contact = ? WHERE id = ? AND (contact IS NULL OR contact = '')`)
    .bind(contact, id)
    .run();
}

export async function setStatus(
  db: D1Database,
  id: string,
  status: "approved" | "rejected" | "pending",
  adminNote?: string,
): Promise<void> {
  await db
    .prepare(`UPDATE submissions SET status = ?, reviewed_at = ?, admin_note = COALESCE(?, admin_note) WHERE id = ?`)
    .bind(status, nowIso(), adminNote ?? null, id)
    .run();
}

export interface DuplicateHit {
  id: string;
  origin: string;
  status: SubmissionRow["status"];
  title: string | null;
  shared: number;
}

/**
 * A listing — approved or queued, never a rejected one — whose archive index
 * shares an item id with `itemIds`: the same blyg at another address. Done in
 * TypeScript over every row rather than with json_each, because the table is
 * tens of rows and the rule is easier to read here than in SQL.
 */
export async function findDuplicate(
  db: D1Database,
  itemIds: string[] | null | undefined,
  excludeId?: string,
): Promise<DuplicateHit | null> {
  if (!itemIds?.length) return null;
  const mine = new Set(itemIds);
  const { results } = await db
    .prepare(
      `SELECT id, origin, status, title, item_ids FROM submissions
       WHERE status != 'rejected' AND item_ids IS NOT NULL AND origin IS NOT NULL`,
    )
    .all<{ id: string; origin: string; status: SubmissionRow["status"]; title: string | null; item_ids: string }>();
  let best: DuplicateHit | null = null;
  for (const r of results ?? []) {
    if (r.id === excludeId) continue;
    let theirs: unknown;
    try {
      theirs = JSON.parse(r.item_ids);
    } catch {
      continue;
    }
    if (!Array.isArray(theirs)) continue;
    const shared = theirs.filter((x) => mine.has(x as string)).length;
    if (shared && (!best || shared > best.shared)) {
      best = { id: r.id, origin: r.origin, status: r.status, title: r.title, shared };
    }
  }
  return best;
}
