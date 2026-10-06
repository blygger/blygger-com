// Which submissions a human has to look at.
//
// The directory used to queue **everything** for manual approval. That was the
// right default while it had five entries and no third-party submissions; it is
// the wrong one now that strangers stand blygs up from `blygger.org/start/` with
// no contact with us, because the queue becomes the bottleneck on a thing whose
// whole point is that anyone can join.
//
// So the rule inverts (Venkat, session 29): a submission that resolves cleanly
// is **listed immediately**, and almost nothing keeps it out.
//
// Then it inverted further, the same afternoon, after the first version held a
// stranger's blyg over a stale manifest `site` and another over a default name
// nobody had chosen: *"I'm not going to chase down harmless failures
// personally. Hold back should be for confirmed security issues. Others can be
// released with a warning."*
//
// So there are three outcomes, not two — **block**, **warn**, **clean** — and
// the line between the first two is **confirmed versus ambiguous**, not
// severe versus mild. A reviewer cannot tell a homograph domain from a
// legitimate non-Latin one, or a hijacked manifest from a site that moved and
// forgot to say so; those warn. What can be confirmed is an act nobody performs
// by accident, and only those block.
//
// ── What "hurt someone" means for a directory ──────────────────────────────
// This surface publishes a name and a link. It does not execute anything, and
// the renderer escapes what it prints, so the realistic harms are not code
// execution — they are **deception** and **misdirection**:
//
//   * a listing that claims an origin it is not served from, so a reader clicks
//     the wrong one;
//   * a listing whose displayed name does not match where it actually goes;
//   * a link that points somewhere a public directory should not send people.
//
// Note what is deliberately NOT here: two listings sharing a *name*. The domain
// is shown beside every entry and is what distinguishes them, two people may
// legitimately both call their blyg the same thing, and the names that collide
// in practice are unchosen defaults rather than attempts at anything.
//
// Every check below is one of those three. Anything that is merely ugly,
// low-quality or uninteresting is NOT a security question and is not flagged —
// a directory that queues submissions on taste is a directory with a queue.
//
// ── The standing rule for changing this file ───────────────────────────────
// A new check must name the harm it prevents in one sentence. If it cannot, it
// belongs in the admin's judgement after listing, not in the gate before it.

import type { Validated } from "./validate.ts";

/** Hosts a public directory should never send a reader to. */
const PRIVATE_HOST = new RegExp(
  [
    "^localhost$",
    "\\.localhost$",
    "\\.local$",
    "\\.internal$",
    "^127\\.",
    "^10\\.",
    "^192\\.168\\.",
    "^172\\.(1[6-9]|2\\d|3[01])\\.",
    "^169\\.254\\.",
    "^\\[?::1\\]?$",
    "^0\\.0\\.0\\.0$",
  ].join("|"),
  "i",
);

/** A bare IPv4/IPv6 literal rather than a name. */
const IP_LITERAL = /^(\d{1,3}\.){3}\d{1,3}$|^\[?[0-9a-f]*:[0-9a-f:]*\]?$/i;

/**
 * Characters that let a string lie about its own shape: C0/C1 controls, the
 * bidirectional overrides, and the invisible formatting characters. A title is
 * escaped before it is printed, so these are not an injection risk — they are a
 * *display* risk, which is the one that matters when the whole page is a list of
 * names sitting next to each other.
 */
// eslint-disable-next-line no-control-regex
const DECEPTIVE_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/;

/**
 * A machine name for each warning, so the scheduled re-check can act on them
 * without matching on prose. Ordered by tier (session 38, Venkat: "indicate
 * health warnings on rechecks publicly and withdraw them from the opml/atom
 * until fix if they stay in that state for a while"):
 *
 *   * **defect** — the site is wrong in a way a reader or a client meets.
 *     Shown publicly from the re-check that finds it; a listing that keeps one
 *     for DEFECT_GRACE_MS leaves the machine surfaces until it is fixed.
 *   * **info** — true, and worth the operator knowing, but nothing is wrong.
 *     Admin-only, never withdrawn. A public "internationalised domain" mark
 *     would be us editorialising about a script.
 *
 * Unreachability is the third tier and is not a code here: it is a failed
 * resolution, tracked by `failing_since` (health.ts).
 */
export type FindingCode = "site-mismatch" | "plain-http" | "private-host" | "ip-literal" | "idn";

export const DEFECTS: ReadonlySet<FindingCode> = new Set(["site-mismatch", "plain-http", "private-host"]);

/** Short public labels, for defects only. */
export const DEFECT_LABEL: Record<string, string> = {
  "site-mismatch": "manifest site mismatch",
  "plain-http": "plain HTTP",
  "private-host": "private address",
};

export interface ReviewVerdict {
  /**
   * A confirmed attack. `null` means list it. Non-null is the *only* thing that
   * keeps a submission out of the directory.
   */
  block: string | null;
  /** One code per warning, same order. */
  codes: FindingCode[];
  /**
   * Things wrong with the submission that are not attacks: listed anyway, shown
   * to the submitter, and their problem to fix rather than ours to adjudicate.
   */
  warnings: string[];
}

export interface ReviewInput {
  submittedUrl: string;
  validated: Validated;
}

function hostOf(raw: string | null): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
}

/** The origin a mismatching manifest claims to be, if we can read one out. */
function assertedOrigin(note: string | null): string | null {
  const m = /manifest asserts site (\S+?),/.exec(note ?? "");
  if (!m) return null;
  try {
    return new URL(m[1]).origin + "/";
  } catch {
    return null;
  }
}

/**
 * Block or warn.
 *
 * The split is Venkat's, session 29: *"Hold back should be for confirmed
 * security issues. Others can be released with a warning."* — after the first
 * version held a stranger's blyg over a stale manifest and another over a
 * default name nobody chose.
 *
 * The distinction that does the work is **confirmed versus ambiguous**. A
 * directory reviewer cannot tell a homograph domain from a legitimate
 * non-Latin one, or a hijacked manifest from a site that moved and forgot to
 * update it — so those are warnings, because a queue that fills with
 * unresolvable judgement calls is a queue nobody empties. What IS confirmable
 * is an act nobody performs by accident: a credential in a public URL, a
 * direction-override character in a display name, a manifest claiming an
 * origin that already belongs to someone else here.
 */
export function reviewReason(input: ReviewInput): ReviewVerdict {
  const { validated: v, submittedUrl } = input;
  const warnings: string[] = [];
  const codes: FindingCode[] = [];
  const block = (reason: string): ReviewVerdict => ({ block: reason, warnings, codes });
  const warn = (code: FindingCode, text: string): void => {
    codes.push(code);
    warnings.push(text);
  };

  if (v.kind === "failure") return block("did not resolve");

  const target = v.homeUrl ?? v.origin ?? submittedUrl;
  const host = hostOf(target);
  if (!host) return block("could not read a hostname from the resolved URL");

  // ── Confirmed: nobody does these by accident ──────────────────────────────

  // A credential in a URL meant for a public list. Also the classic way to make
  // a link read as one host and go to another.
  try {
    const u = new URL(target);
    if (u.username || u.password) return block("URL contains credentials");
  } catch {
    return block("unparseable URL");
  }

  // A direction-override or control character in a display name. There is no
  // innocent reason to put one in a title; its only effect is to make the name
  // render as something other than what it is, on a page that is a list of
  // names side by side.
  if (v.title && DECEPTIVE_CHARS.test(v.title)) {
    return block("title contains control or direction-override characters");
  }

  // A manifest asserting an origin that is already someone else's listing was
  // a block for about an hour, on the theory that mismatch *onto a neighbour*
  // is checkable where mismatch alone is not. The first real row it met was
  // `[jdbb] studio blyg`, whose manifest claims `jd-blyg.exe.xyz` — the
  // operator's own previous address, already listed, because they moved hosts
  // and did not update `site`.
  //
  // Which is the common case, and the rule could not tell it from an impostor.
  // "I cannot tell" is the definition of ambiguous, so this warns like every
  // other mismatch. Blocking it would mean the first thing that happens to
  // somebody migrating domains is that they get queued.
  //
  // What remains blockable is only what nobody does by accident. There are
  // two such things, both above this line.

  // ── Ambiguous: listed, with a warning ─────────────────────────────────────

  const claimed = assertedOrigin(v.note);
  if (v.note && v.note.includes("manifest asserts site")) {
    warn(
      "site-mismatch",
      `Your manifest's \`site\` says ${claimed ?? "another address"}, but it is served from ${v.origin}. ` +
        "Readers and other clients use the address it is served from; update `site` so the two agree.",
    );
  }
  if (!/^https:/i.test(target)) {
    warn("plain-http", "Served over plain HTTP. Anyone on the network path can read and alter it — add TLS.");
  }
  if (PRIVATE_HOST.test(host)) {
    warn("private-host", `${host} is a private or loopback address, so nobody else can reach it. Listed, but it will not work for readers.`);
  }
  if (IP_LITERAL.test(host)) {
    warn("ip-literal", `Listed at a bare IP address. It works, but it cannot move hosts and cannot be secured properly — a hostname is worth getting.`);
  }
  if (host.startsWith("xn--") || host.includes(".xn--") || /[^\x00-\x7F]/.test(host)) {
    warn("idn", `${host} is an internationalised domain. Nothing is wrong with that — it is noted because such names can be hard to tell apart visually.`);
  }

  return { block: null, warnings, codes };
}
