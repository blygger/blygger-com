// The scheduled pass (session 38): keep the listings true, and look around.
//
// A listing is resolved once, at submission, and was then "valid" forever. That
// was harmless while the directory was a page people read; it is not harmless
// now that /blygs.opml hands the list to agents, which will dutifully poll a
// feed that died in August. So every listing is re-resolved on a schedule, with
// the same resolver a submission uses.
//
// What a failure does, under the gate-on-confirmed rule (review.ts): one failed
// check does nothing anyone can see. A listing that has failed **every** check
// for DORMANT_AFTER_MS is dormant, and dormant listings leave the machine
// surfaces — the OPML export and the listings feed — but stay on the page.
// Marking them publicly is the TODO's open question 1 and is not decided here.
// Any success clears the run, so a dormant listing comes back by itself.
//
// The same pass reads each listed blyg's §11 blogroll and records what it
// follows. Those sightings are admin-only and never listed: this directory
// lists blygs that chose to list themselves. An unlisted blyg found this way is
// someone to invite.
//
// ── Budget ─────────────────────────────────────────────────────────────────
// A Worker invocation may make a bounded number of subrequests (50 on the free
// plan). Resolution is at most six fetches (decision #17), plus one for a feed
// title and one for a blogroll, so a run checks LISTINGS_PER_RUN listings
// (≤ 32 fetches) and SIGHTINGS_PER_RUN sightings (≤ 14), least recently
// checked first. At an hourly cron that cycles ~33 listings about every 8 hours.

import { XMLParser } from "fast-xml-parser";
import { reviewReason } from "./review.ts";
import { validateSubmission } from "./validate.ts";
import type { FetchLike } from "./vendor/http.ts";
import { IMPORTER_USER_AGENT } from "./vendor/http.ts";
import type { SubmissionRow } from "./types.ts";

export const LISTINGS_PER_RUN = 4;
export const SIGHTINGS_PER_RUN = 2;
export const DORMANT_AFTER_MS = 72 * 3600 * 1000;
/** A blogroll is a publisher's curated list; past this it is an export, and we stop reading. */
const MAX_BLOGROLL_ENTRIES = 200;
const FETCH_TIMEOUT_MS = 10_000;

/**
 * platformFetch with a timeout. The vendored one has none, and a host that
 * accepts the connection and never answers (one listing does exactly that
 * today) would otherwise hold the whole scheduled run.
 */
export const timedFetch: FetchLike = async (url, init) => {
  const res = await fetch(url, {
    redirect: "follow",
    method: init?.method ?? "GET",
    headers: { "User-Agent": IMPORTER_USER_AGENT, ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  return { ok: res.ok, status: res.status, url: res.url || url, headers: res.headers, text: () => res.text() };
};

/** Dormant: failing every check, continuously, for long enough to be sure. */
export function isDormant(failingSince: string | null, now: Date): boolean {
  if (!failingSince) return false;
  return now.getTime() - Date.parse(failingSince) >= DORMANT_AFTER_MS;
}

/** What to resolve to re-check a listing: the blyg's origin, or the legacy row's feed. */
function recheckTarget(row: SubmissionRow): string {
  return row.origin ?? row.home_url ?? row.submitted_url;
}

export interface Sighting {
  feedUrl: string;
  title: string | null;
  htmlUrl: string | null;
}

/** The `<outline xmlUrl>` entries of an OPML file, nested folders included. */
export function parseBlogroll(xml: string): Sighting[] {
  let doc: unknown;
  try {
    doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@" }).parse(xml);
  } catch {
    return [];
  }
  const out: Sighting[] = [];
  const walk = (node: unknown): void => {
    if (out.length >= MAX_BLOGROLL_ENTRIES) return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    const xmlUrl = o["@xmlUrl"];
    if (typeof xmlUrl === "string") {
      try {
        const u = new URL(xmlUrl.trim());
        if (u.protocol === "https:" || u.protocol === "http:") {
          const t = o["@title"] ?? o["@text"];
          const h = o["@htmlUrl"];
          out.push({
            feedUrl: u.toString(),
            title: typeof t === "string" && t.trim() ? t.trim().slice(0, 200) : null,
            htmlUrl: typeof h === "string" && h.trim() ? h.trim() : null,
          });
        }
      } catch {
        // Not a URL; a blogroll entry we cannot follow is skipped, not an error.
      }
    }
    walk(o["outline"]);
  };
  walk((doc as Record<string, any>)?.opml?.body);
  return out;
}

export interface RunReport {
  checked: { id: string; ok: boolean; note: string | null }[];
  sightingsRecorded: number;
  sightingsResolved: number;
}

/**
 * One scheduled pass. Never throws for a single listing's sake: every row is
 * checked inside its own try, and a row that throws is a failed check.
 */
export async function runHealthPass(db: D1Database, fetchFn: FetchLike, now = new Date()): Promise<RunReport> {
  const nowIso = now.toISOString();
  const report: RunReport = { checked: [], sightingsRecorded: 0, sightingsResolved: 0 };

  const { results: due } = await db
    .prepare(
      `SELECT * FROM submissions WHERE status = 'approved'
       ORDER BY last_checked_at IS NOT NULL, last_checked_at ASC LIMIT ?`,
    )
    .bind(LISTINGS_PER_RUN)
    .all<SubmissionRow>();

  for (const row of due ?? []) {
    let ok = false;
    let note: string | null = null;
    let warnings: string[] | null = null;
    try {
      const v = await validateSubmission(recheckTarget(row), fetchFn);
      if (v.kind === "failure") {
        note = v.note;
      } else if (v.origin !== row.origin) {
        // Resolves, but to something else — most usefully a legacy feed that
        // has since become a blyg. Rewriting origin and kind under a live
        // listing is a re-listing, so it is reported to the admin and the
        // operator re-submits; the listing itself is still alive.
        ok = true;
        note = `now resolves as ${v.kind} at ${v.origin}; re-submit to update the listing`;
      } else {
        ok = true;
        // Warnings describe the site as it is now, so a fixed site stops being
        // marked. A check that newly *blocks* is reported, never acted on: a
        // scheduled job does not delist on a third party's say-so.
        const r = reviewReason({ submittedUrl: row.submitted_url, validated: v });
        warnings = r.warnings;
        if (r.block) note = `would now be held: ${r.block}`;
        if (v.kind === "blyg" && v.blogrollUrl) {
          report.sightingsRecorded += await recordBlogroll(db, fetchFn, v.blogrollUrl, row.origin!, nowIso);
        }
      }
    } catch (e) {
      note = `check threw: ${e instanceof Error ? e.message : String(e)}`;
    }

    await db
      .prepare(
        `UPDATE submissions SET
           last_checked_at = ?1,
           last_ok_at      = CASE WHEN ?2 THEN ?1 ELSE last_ok_at END,
           failing_since   = CASE WHEN ?2 THEN NULL ELSE COALESCE(failing_since, ?1) END,
           health_note     = ?3,
           warnings        = COALESCE(?4, warnings)
         WHERE id = ?5`,
      )
      .bind(nowIso, ok ? 1 : 0, note, warnings ? JSON.stringify(warnings) : null, row.id)
      .run();
    report.checked.push({ id: row.id, ok, note });
  }

  report.sightingsResolved = await resolveSightings(db, fetchFn, nowIso);
  return report;
}

async function recordBlogroll(
  db: D1Database,
  fetchFn: FetchLike,
  url: string,
  seenOn: string,
  nowIso: string,
): Promise<number> {
  let xml: string;
  try {
    const res = await fetchFn(url);
    if (!res.ok) return 0;
    xml = await res.text();
  } catch {
    return 0;
  }
  const entries = parseBlogroll(xml);
  if (!entries.length) return 0;
  await db.batch(
    entries.map((s) =>
      db
        .prepare(
          `INSERT INTO sightings (feed_url, title, html_url, seen_on, first_seen_at, last_seen_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (feed_url) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
        )
        .bind(s.feedUrl, s.title, s.htmlUrl, seenOn, nowIso, nowIso),
    ),
  );
  return entries.length;
}

/** Resolve the oldest unchecked sightings, so the admin page can tell blygs from feeds. */
async function resolveSightings(db: D1Database, fetchFn: FetchLike, nowIso: string): Promise<number> {
  const { results } = await db
    .prepare(`SELECT feed_url FROM sightings WHERE checked_at IS NULL ORDER BY first_seen_at LIMIT ?`)
    .bind(SIGHTINGS_PER_RUN)
    .all<{ feed_url: string }>();
  let n = 0;
  for (const { feed_url } of results ?? []) {
    let kind: string = "failure";
    let origin: string | null = null;
    try {
      const v = await validateSubmission(feed_url, fetchFn);
      kind = v.kind;
      origin = v.origin;
    } catch {
      // Recorded as a failure; a sighting is re-seen, not retried.
    }
    await db
      .prepare(`UPDATE sightings SET kind = ?, origin = ?, checked_at = ? WHERE feed_url = ?`)
      .bind(kind, origin, nowIso, feed_url)
      .run();
    n++;
  }
  return n;
}

export interface UnlistedBlyg {
  origin: string;
  title: string | null;
  seen_on: string;
  first_seen_at: string;
}

/** Sightings that resolve as a blyg nobody has listed — the admin's invitation list. */
export async function listUnlistedBlygs(db: D1Database): Promise<UnlistedBlyg[]> {
  const { results } = await db
    .prepare(
      `SELECT s.origin, MIN(s.title) AS title, MIN(s.seen_on) AS seen_on, MIN(s.first_seen_at) AS first_seen_at
       FROM sightings s
       WHERE s.kind = 'blyg' AND s.origin IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM submissions m WHERE m.origin = s.origin)
       GROUP BY s.origin ORDER BY first_seen_at DESC`,
    )
    .all<UnlistedBlyg>();
  return results ?? [];
}
