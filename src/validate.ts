// Submission validation: run the SAME resolution algorithm a blyg client runs
// (locked decision #17, v0.2-plan §2.1) against whatever URL was offered.
//
// This is the most valuable thing the directory does. Every other part of it is
// a list of links; this part points our own resolver at strangers' real sites,
// which is a test of the spec we have no other way to run. Failures are
// therefore recorded, never discarded — a resolver that cannot find a blyg
// somebody insists is there is a bug report.

import { resolve } from "./vendor/resolve.ts";
import type { FetchLike } from "./vendor/http.ts";

export interface Validated {
  kind: "blyg" | "rss" | "failure";
  origin: string | null;
  title: string | null;
  homeUrl: string | null;
  note: string | null;
}

/** Pull a human-facing title out of a manifest without trusting its shape. */
function manifestTitle(manifest: Record<string, unknown>): string | null {
  const t = manifest["title"];
  return typeof t === "string" && t.trim() ? t.trim().slice(0, 200) : null;
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
      // Surfaced, not adopted — decision #17's rule that a mirror must never
      // inherit another origin's identity. Worth recording when it happens.
      note: r.siteMismatch
        ? `manifest asserts site ${r.siteMismatch.asserted}, served from ${r.siteMismatch.actual}`
        : null,
    };
  }
  if (r.kind === "rss") {
    return { kind: "rss", origin: r.feedUrl, title: null, homeUrl: homeFromFeed(r.feedUrl), note: null };
  }
  return {
    kind: "failure",
    origin: null,
    title: null,
    homeUrl: null,
    note: `resolution failed; tried: ${r.tried.join(", ")}`,
  };
}
