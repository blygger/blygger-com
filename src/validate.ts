// Submission validation: run the SAME resolution algorithm a blyg client runs
// (locked decision #17, v0.2-plan §2.1) against whatever URL was offered.
//
// This is the most valuable thing the directory does. Every other part of it is
// a list of links; this part points our own resolver at strangers' real sites,
// which is a test of the spec we have no other way to run. Failures are
// therefore recorded, never discarded — a resolver that cannot find a blyg
// somebody insists is there is a bug report.

import { resolve } from "./vendor/resolve.ts";
import { platformFetch, type FetchLike } from "./vendor/http.ts";
import { channelTitle, itemDates } from "./feed-title.ts";

export interface Validated {
  kind: "blyg" | "rss" | "failure";
  origin: string | null;
  title: string | null;
  homeUrl: string | null;
  note: string | null;
  /**
   * A blyg's §11 blogroll, absolute, when its manifest advertises one. Only the
   * scheduled health check reads it (to find blygs worth inviting); a
   * submission ignores it.
   */
  blogrollUrl?: string | null;
  /**
   * A blyg's feed, absolute: the manifest's `feed` (authoritative from 0.4,
   * §6.1), else the default `feed.xml`. Absent for feeds, whose origin is the feed.
   */
  feedUrl?: string | null;
  /** What a blyg's manifest declares about itself (§6.1). Absent for feeds. */
  census?: Census;
  /**
   * The item ids in a blyg's archive index (§6.2), or null when it could not be
   * read. Ids are minted by the publishing blyg, so two origins sharing one are
   * the same store on two addresses — the duplicate test (session 38).
   */
  itemIds?: string[] | null;
  /**
   * The manifest's OPTIONAL `moved_from` (decision #88, spec §16.13): former
   * identities this blyg declares as its own. Only the re-check reads it.
   */
  movedFrom?: string[];
  /**
   * Recent post times, ISO, any order (session 61, src/activity.ts): a blyg's
   * archive-index `created` times, or a feed's item dates. Null when unread.
   */
  recentPosts?: string[] | null;
}

const MAX_ITEM_IDS = 5000;

/**
 * Item ids and creation times from the archive index. The manifest's `items`
 * key is the path (authoritative from 0.4, §16; `items/index.json` by
 * default). Never throws: an unreadable index means no duplicate test and no
 * activity level, not a failed submission.
 */
async function readIndex(
  manifest: Record<string, unknown>,
  origin: string,
  fetchFn: FetchLike,
): Promise<{ ids: string[]; created: string[] } | null> {
  try {
    const path = typeof manifest["items"] === "string" && manifest["items"].trim() ? manifest["items"].trim() : "items/index.json";
    const res = await fetchFn(new URL(path, origin).toString());
    if (!res.ok) return null;
    const doc = JSON.parse(await res.text()) as { items?: unknown };
    if (!Array.isArray(doc.items)) return null;
    const ids = new Set<string>();
    const created: string[] = [];
    for (const it of doc.items) {
      const entry = it as { id?: unknown; created?: unknown } | null;
      const id = entry?.id;
      if (typeof id === "string" && id.length > 0 && id.length <= 64) ids.add(id);
      if (typeof entry?.created === "string" && entry.created.length <= 40) created.push(entry.created);
      if (ids.size >= MAX_ITEM_IDS) break;
    }
    return { ids: [...ids], created };
  } catch {
    return null;
  }
}

export interface ValidateOptions {
  /** Read the archive index for the duplicate test. Off for blogroll sightings, to save a fetch. */
  itemIds?: boolean;
}

/**
 * The protocol version a current client publishes. Bump when the spec opens
 * 0.4 (blygger-spec decision #43); until then 0.3 is the wire version key.
 */
export const CURRENT_PROTOCOL = "0.3";

/** a < b, for "major.minor" keys. Unparseable sorts as not-behind. */
export function protocolBehind(a: string, b: string): boolean {
  const [am, an] = a.split(".").map(Number);
  const [bm, bn] = b.split(".").map(Number);
  if ([am, an, bm, bn].some((x) => !Number.isFinite(x))) return false;
  return am < bm || (am === bm && an < bn);
}

export interface Census {
  /** The manifest's `blyg` version key, e.g. "0.3". */
  protocol: string | null;
  level: number | null;
  generator: string | null;
}

/**
 * The census fields, read defensively: they are a stranger's self-description
 * and end up printed on a public page. Shape-checked, length-capped, never
 * trusted beyond that — §3.2 makes `level` and `generator` informative only.
 */
export function manifestCensus(manifest: Record<string, unknown>): Census {
  const b = manifest["blyg"];
  const ver = typeof b === "string" ? b.trim() : typeof b === "number" ? String(b) : "";
  const l = manifest["level"];
  const g = manifest["generator"];
  return {
    protocol: /^\d{1,3}\.\d{1,3}$/.test(ver) ? ver : null,
    level: typeof l === "number" && Number.isInteger(l) && l >= 0 && l <= 9 ? l : null,
    generator: typeof g === "string" && g.trim() ? g.trim().slice(0, 100) : null,
  };
}

/** Pull a human-facing title out of a manifest without trusting its shape. */
function manifestTitle(manifest: Record<string, unknown>): string | null {
  const t = manifest["title"];
  return typeof t === "string" && t.trim() ? t.trim().slice(0, 200) : null;
}

/** The manifest's OPTIONAL `blogroll` key (§6.1), made absolute against the origin. */
/** The feed a blyg's manifest names, resolved against its origin (§6.1); `feed.xml` when absent. */
function manifestFeed(manifest: Record<string, unknown>, origin: string): string | null {
  const f = manifest["feed"];
  const path = typeof f === "string" && f.trim() ? f.trim() : "feed.xml";
  try {
    const u = new URL(path, origin);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function manifestBlogroll(manifest: Record<string, unknown>, origin: string): string | null {
  const b = manifest["blogroll"];
  if (typeof b !== "string" || !b.trim()) return null;
  try {
    const u = new URL(b.trim(), origin);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * The directory lists **home pages, not feeds** (Venkat, session 21). For a blyg
 * that is its origin; for a plain RSS feed the feed URL is not a page a human
 * wants, so fall back to the feed's own origin, which is the closest thing to a
 * home page obtainable without another fetch.
 */
function homeFromFeed(feedUrl: string): string | null {
  try {
    return new URL(feedUrl).origin + "/";
  } catch {
    return null;
  }
}

/**
 * The feed's own name, or `null` if it cannot be had. Never throws and never
 * fails a submission: by this point the URL has already resolved as a feed, and
 * a missing title costs a nicer label, nothing more.
 */
async function feedInfo(feedUrl: string, fetchFn: FetchLike = platformFetch): Promise<{ title: string | null; dates: string[] | null }> {
  try {
    const res = await fetchFn(feedUrl);
    if (!res.ok) return { title: null, dates: null };
    const xml = await res.text();
    return { title: channelTitle(xml), dates: itemDates(xml) };
  } catch {
    return { title: null, dates: null };
  }
}

export async function validateSubmission(
  raw: string,
  fetchFn: FetchLike = platformFetch,
  opts: ValidateOptions = {},
): Promise<Validated> {
  let input: string;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("scheme");
    input = u.toString();
  } catch {
    return { kind: "failure", origin: null, title: null, homeUrl: null, note: "not a http(s) URL" };
  }

  const r = await resolve(input, fetchFn);
  if (r.kind === "blyg") {
    const index = opts.itemIds === false ? null : await readIndex(r.manifest, r.origin, fetchFn);
    return {
      kind: "blyg",
      origin: r.origin,
      title: manifestTitle(r.manifest),
      homeUrl: r.origin,
      blogrollUrl: manifestBlogroll(r.manifest, r.origin),
      feedUrl: manifestFeed(r.manifest, r.origin),
      census: manifestCensus(r.manifest),
      movedFrom: Array.isArray(r.manifest["moved_from"])
        ? (r.manifest["moved_from"] as unknown[]).filter((x): x is string => typeof x === "string")
        : [],
      itemIds: index?.ids ?? null,
      recentPosts: index?.created ?? null,
      // Surfaced, not adopted — decision #17's rule that a mirror must never
      // inherit another origin's identity. Worth recording when it happens.
      note: r.siteMismatch
        ? `manifest asserts site ${r.siteMismatch.asserted}, served from ${r.siteMismatch.actual}`
        : null,
    };
  }
  if (r.kind === "rss") {
    // One extra GET, at submission and at each re-check, to learn what the
    // publication calls itself and when it posted (the activity level). The
    // resolver already fetched this document to decide it was a feed but does
    // not return the body, and `src/vendor/` is copied from
    // blygger-spec and must not be edited here — so the choice is one more
    // request or a feed row that reads as a bare hostname forever. A directory
    // whose entries are half named and half hostnames is not much of a
    // directory.
    const info = await feedInfo(r.feedUrl, fetchFn);
    return {
      kind: "rss",
      origin: r.feedUrl,
      title: info.title,
      homeUrl: homeFromFeed(r.feedUrl),
      recentPosts: info.dates,
      note: null,
    };
  }
  return {
    kind: "failure",
    origin: null,
    title: null,
    homeUrl: null,
    note: `resolution failed; tried: ${r.tried.join(", ")}`,
  };
}
