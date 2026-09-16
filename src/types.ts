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
}
