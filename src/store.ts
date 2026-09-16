// Every D1 query the directory makes. Kept in one file so the public surface
// (one query, approved-only) is obvious and cannot accidentally widen.

import type { SubmissionRow } from "./types.ts";
import { newId, nowIso } from "./util.ts";

/**
 * The public listing. `status = 'approved'` is not a filter applied by a caller
 * — it is baked in here, so there is no code path that lists a pending row to
 * the public page.
 */
export async function listApproved(db: D1Database): Promise<SubmissionRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM submissions
       WHERE status = 'approved' AND home_url IS NOT NULL
       ORDER BY submitted_at DESC`,
    )
    .all<SubmissionRow>();
  return results ?? [];
}

export async function listForReview(db: D1Database): Promise<SubmissionRow[]> {
  const { results } = await db
    .prepare(`SELECT * FROM submissions ORDER BY status = 'pending' DESC, submitted_at DESC`)
    .all<SubmissionRow>();
  return results ?? [];
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
}

export async function insertSubmission(db: D1Database, s: NewSubmission): Promise<string> {
  const id = newId();
  await db
    .prepare(
      `INSERT INTO submissions
         (id, submitted_url, kind, origin, title, home_url, resolve_note, status, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    )
    .bind(id, s.submittedUrl, s.kind, s.origin, s.title, s.homeUrl, s.resolveNote, nowIso())
    .run();
  return id;
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
