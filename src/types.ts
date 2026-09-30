export interface Env {
  DB: D1Database;
  OWNER_PASSWORD: string;
  COOKIE_SECRET: string;
}

export interface SubmissionRow {
  id: string;
  submitted_url: string;
  kind: "blyg" | "rss" | "failure" | null;
  origin: string | null;
  title: string | null;
  home_url: string | null;
  resolve_note: string | null;
  status: "pending" | "approved" | "rejected";
  submitted_at: string;
  reviewed_at: string | null;
  admin_note: string | null;
  /** Optional, operator-supplied, **never published** — see migration 0002. */
  contact: string | null;
  /**
   * Why this row was held for review, or `null` if it was listed automatically
   * (migration 0003). Also `null` on every row that predates auto-approval —
   * those were queued by the old blanket rule, not by a finding about them.
   */
  review_reason: string | null;
  /** JSON array of operator-facing findings (migration 0004); null on older rows. */
  warnings: string | null;
}

/**
 * What the public page is allowed to know about a listing. Deliberately a
 * different type from `SubmissionRow` rather than a subset of it by convention:
 * the public query names these four columns and the page function takes this
 * type, so a private column added to the table later cannot reach a public page
 * by being added to a row type. `contact` is the column that made this worth
 * enforcing in the types rather than in a code comment.
 */
export interface PublicRow {
  kind: SubmissionRow["kind"];
  title: string | null;
  home_url: string | null;
}
