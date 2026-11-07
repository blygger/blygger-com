// Activity level (session 61): how recently and how often a listing publishes,
// for the directory's default order and its high / medium / low mark.
//
// The input is the listing's recent post times, read by the scheduled re-check
// from what it fetches anyway: a blyg's archive index (`created`, §6.2) or a
// plain feed's item dates. Nothing extra is requested from anyone's site.
//
// The score is a time-discounted sum over the latest posts: each counts
// 0.5^(age / HALF_LIFE_DAYS), so a post today counts 1, one a month ago ½, one
// three months ago ⅛. It is computed when the page renders, so a listing that
// stops publishing fades between re-checks rather than holding its last score.
//
// Two guards. Posts within BURST_GAP of each other count once: some clients
// publish a document as ten fragments in a minute, and that is one act, not ten
// (the same reading as spec §13.7). And a time in the future is ignored rather
// than counted as today, since post times are self-asserted (§5.2, §13.7).

export const POSTS_COUNTED = 10;
export const HALF_LIFE_DAYS = 30;
export const BURST_GAP_MS = 60 * 60 * 1000;
/** How many raw post times a re-check keeps, so bursts can collapse and still leave POSTS_COUNTED. */
export const POSTS_STORED = 50;

/** A weekly poster scores about 5; a monthly one about 2; one post three months ago, 0.125. */
export const HIGH_AT = 3;
export const MEDIUM_AT = 0.75;

export type ActivityLevel = "high" | "medium" | "low";

export interface Activity {
  score: number;
  /** Null when no post times are known yet: unmeasured, which is not the same as low. */
  level: ActivityLevel | null;
  /** Publishing events counted (bursts collapsed), at most POSTS_COUNTED. */
  events: number;
  /** The newest counted post, ISO. */
  last: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** A little skew is tolerated; anything later than this is a future date. */
const FUTURE_SLACK_MS = DAY_MS;

/** Parse the stored column: a JSON array of ISO times, any order. Never throws. */
export function parsePostTimes(json: string | null | undefined): number[] {
  if (!json) return [];
  try {
    const raw = JSON.parse(json);
    if (!Array.isArray(raw)) return [];
    return raw
      .map((t) => (typeof t === "string" ? Date.parse(t) : NaN))
      .filter((t) => Number.isFinite(t));
  } catch {
    return [];
  }
}

/** Newest first, future dates dropped, bursts collapsed to their newest post. */
function publishingEvents(times: number[], now: number): number[] {
  const sorted = times.filter((t) => t <= now + FUTURE_SLACK_MS).sort((a, b) => b - a);
  const events: number[] = [];
  for (const t of sorted) {
    if (events.length && events[events.length - 1] - t < BURST_GAP_MS) continue;
    events.push(t);
    if (events.length === POSTS_COUNTED) break;
  }
  return events;
}

export function activityOf(json: string | null | undefined, now = new Date()): Activity {
  const nowMs = now.getTime();
  const events = publishingEvents(parsePostTimes(json), nowMs);
  if (!events.length) return { score: 0, level: null, events: 0, last: null };
  const score = events.reduce((sum, t) => sum + 0.5 ** (Math.max(0, nowMs - t) / DAY_MS / HALF_LIFE_DAYS), 0);
  const level: ActivityLevel = score >= HIGH_AT ? "high" : score >= MEDIUM_AT ? "medium" : "low";
  return { score, level, events: events.length, last: new Date(events[0]).toISOString() };
}

/** Keep the newest POSTS_STORED valid times as ISO strings, for the column. Null when there are none. */
export function postTimesColumn(times: Iterable<string>): string | null {
  const parsed = [...times].map((t) => Date.parse(t)).filter((t) => Number.isFinite(t));
  if (!parsed.length) return null;
  parsed.sort((a, b) => b - a);
  return JSON.stringify(parsed.slice(0, POSTS_STORED).map((t) => new Date(t).toISOString()));
}
