// The channel title of a plain RSS or Atom feed.
//
// Why this exists as its own file: `src/vendor/` is copied from blygger-spec
// and must never be edited here, and the vendored resolver's `rss` result is
// `{ kind: "rss", feedUrl }` — it carries no title, because a *client* resolving
// a feed does not need one. The directory does: without it a feed row renders
// as a bare hostname beside blyg rows that show their real names.
//
// (The note in `status.md` said the resolver "reads the feed's channel title at
// submission and the row does not keep it". That was wrong twice over — the
// resolver never surfaced one, so there was nothing to keep. Corrected there.)
//
// A blyg's name comes from its manifest `title`, which is the protocol's own
// identity field. The closest true analogue for a plain feed is the **channel
// title**, which is the publication's self-asserted name in the feed's own
// format — not the home page's `<title>`, which is a page title and is usually
// "Home | Something" or worse.

import { XMLParser, XMLValidator } from "fast-xml-parser";

/** Feed titles can be a string, a CDATA node, or an Atom `{ "#text": … }`. */
function textOf(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object") {
    const t = (value as Record<string, unknown>)["#text"];
    if (typeof t === "string") return t.trim() || null;
    if (typeof t === "number") return String(t);
  }
  return null;
}

/**
 * `<rss><channel><title>` or `<feed><title>`, capped at 200 characters like a
 * manifest title. `null` for anything that is not a well-formed feed with a
 * title — the caller then falls back to the hostname, which is what every feed
 * row showed before this.
 *
 * Deliberately tolerant in the same way the vendored parser is: a feed that
 * fails to parse is not a submission failure. The submission has *already*
 * resolved as a feed by the time this runs; a missing title is cosmetic, and
 * refusing the listing over it would be the tail wagging the dog.
 */
export function channelTitle(xml: string): string | null {
  if (XMLValidator.validate(xml) !== true) return null;
  let parsed: unknown;
  try {
    parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);
  } catch {
    return null;
  }
  const root = parsed as Record<string, any> | null;
  const raw = textOf(root?.rss?.channel?.title) ?? textOf(root?.feed?.title);
  return raw ? raw.slice(0, 200) : null;
}

/**
 * The publication dates of a feed's items, as ISO strings (session 61, for the
 * activity level): RSS `<item><pubDate>`, Atom `<entry>` `published`, else
 * `updated`. Unparseable dates are skipped; anything that is not a well-formed
 * feed gives none. Same tolerance as `channelTitle`: a missing date costs an
 * unmeasured activity mark, nothing more.
 */
export function itemDates(xml: string): string[] {
  if (XMLValidator.validate(xml) !== true) return [];
  let parsed: unknown;
  try {
    parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);
  } catch {
    return [];
  }
  const root = parsed as Record<string, any> | null;
  const list = (v: unknown): Record<string, unknown>[] =>
    Array.isArray(v) ? v : v && typeof v === "object" ? [v as Record<string, unknown>] : [];
  const rss = list(root?.rss?.channel?.item).map((i) => textOf(i["pubDate"]));
  const atom = list(root?.feed?.entry).map((e) => textOf(e["published"]) ?? textOf(e["updated"]));
  const out: string[] = [];
  for (const raw of [...rss, ...atom]) {
    const t = raw ? Date.parse(raw) : NaN;
    if (Number.isFinite(t)) out.push(new Date(t).toISOString());
  }
  return out;
}

/**
 * The publication's author from the feed itself (session 75, the directory's
 * about line): Atom `<feed><author><name>`, RSS `<dc:creator>` or
 * `<itunes:author>` on the channel, or the name in `managingEditor`'s
 * "email (Name)" form. Never the bare address: an email does not go on a
 * public page. Same tolerance as `channelTitle`.
 */
export function channelAuthor(xml: string): string | null {
  if (XMLValidator.validate(xml) !== true) return null;
  let parsed: unknown;
  try {
    parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);
  } catch {
    return null;
  }
  const root = parsed as Record<string, any> | null;
  const one = (v: unknown) => (Array.isArray(v) ? v[0] : v);
  const channel = root?.rss?.channel;
  const editor = textOf(channel?.managingEditor)?.match(/\(([^()]+)\)\s*$/)?.[1]?.trim() || null;
  const raw = textOf(one(root?.feed?.author)?.name) ?? textOf(one(channel?.["dc:creator"])) ??
    textOf(one(channel?.["itunes:author"])) ?? editor;
  return raw && !raw.includes("@") ? raw.slice(0, 100) : null;
}
