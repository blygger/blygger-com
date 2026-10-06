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
import { channelTitle } from "./feed-title.ts";

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
  /** What a blyg's manifest declares about itself (§6.1). Absent for feeds. */
  census?: Census;
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
async function feedTitle(feedUrl: string, fetchFn: FetchLike = platformFetch): Promise<string | null> {
  try {
    const res = await fetchFn(feedUrl);
    if (!res.ok) return null;
    return channelTitle(await res.text());
  } catch {
    return null;
  }
}

export async function validateSubmission(raw: string, fetchFn?: FetchLike): Promise<Validated> {
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
    return {
      kind: "blyg",
      origin: r.origin,
      title: manifestTitle(r.manifest),
      homeUrl: r.origin,
      blogrollUrl: manifestBlogroll(r.manifest, r.origin),
      census: manifestCensus(r.manifest),
      // Surfaced, not adopted — decision #17's rule that a mirror must never
      // inherit another origin's identity. Worth recording when it happens.
      note: r.siteMismatch
        ? `manifest asserts site ${r.siteMismatch.asserted}, served from ${r.siteMismatch.actual}`
        : null,
    };
  }
  if (r.kind === "rss") {
    // One extra GET, at submission time only, to learn what the publication
    // calls itself. The resolver already fetched this document to decide it was
    // a feed but does not return the body, and `src/vendor/` is copied from
    // blygger-spec and must not be edited here — so the choice is one more
    // request or a feed row that reads as a bare hostname forever. A directory
    // whose entries are half named and half hostnames is not much of a
    // directory.
    return {
      kind: "rss",
      origin: r.feedUrl,
      title: await feedTitle(r.feedUrl, fetchFn),
      homeUrl: homeFromFeed(r.feedUrl),
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
