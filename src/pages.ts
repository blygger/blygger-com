// The whole site: one public page, one admin page. Server-rendered, no build
// step, no framework. The visual language deliberately echoes blygger.org
// (monospace wordmark, orange accent, generous measure) so the two read as one
// project without sharing a stylesheet across origins.

import type { PublicRow, SubmissionRow } from "./types.ts";
import { escapeHtml } from "./util.ts";
import { isWithdrawn, parseFlags, publicMarks, type UnlistedBlyg } from "./health.ts";
import { DEFECTS } from "./review.ts";
import { CURRENT_PROTOCOL, protocolBehind } from "./validate.ts";

const STYLE = `
:root {
  color-scheme: light dark;
  --page: #faf9f6; --ink: #1a1a18; --soft: #6b6b66; --rule: #e6e4de;
  --accent: #d95a1f;
  --sans: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  --serif: "Iowan Old Style", Palatino, Charter, Georgia, serif;
}
@media (prefers-color-scheme: dark) {
  :root { --page:#16161a; --ink:#e8e6e1; --soft:#9a978f; --rule:#2c2c31; --accent:#e8763f; }
}
* { box-sizing: border-box; }
body { background: var(--page); color: var(--ink); font-family: var(--serif);
  font-size: 17px; line-height: 1.6; margin: 0; padding: 2.5rem 1.25rem 5rem; }
.wrap { max-width: 44rem; margin: 0 auto; }
header.top { display: flex; justify-content: space-between; align-items: baseline;
  flex-wrap: wrap; gap: 0.75rem; margin-bottom: 2.5rem; }
.wordmark { font-family: var(--sans); font-weight: 700; font-size: 1.05rem;
  text-decoration: none; color: var(--ink); }
.wordmark .dot { display: inline-block; width: 0.5em; height: 0.5em; border-radius: 50%;
  background: var(--accent); margin-right: 0.45em; }
header.top nav a { font-family: var(--sans); font-size: 0.82rem; color: var(--soft);
  text-decoration: none; margin-left: 1rem; }
header.top nav a:hover { color: var(--accent); }
h1 { font-family: var(--sans); font-size: 1.6rem; line-height: 1.25; margin: 0 0 0.6rem; }
.lede { color: var(--soft); margin: 0 0 2.5rem; }
a { color: var(--accent); }

form.add { border: 1px solid var(--rule); border-radius: 4px; padding: 1.25rem;
  margin-bottom: 3rem; }
details.add-wrap { margin: -1.25rem 0 2.5rem; }
details.add-wrap > summary { display: inline-block; list-style: none; cursor: pointer;
  font-family: var(--sans); font-size: 0.88rem; padding: 0.55rem 1.1rem;
  border: 1px solid var(--accent); border-radius: 3px; color: var(--accent); }
details.add-wrap > summary::-webkit-details-marker { display: none; }
details.add-wrap > summary:hover { background: var(--accent); color: #fff; }
details.add-wrap[open] > summary { background: var(--accent); color: #fff; margin-bottom: 1rem; }
details.add-wrap form.add { margin-bottom: 0; }
form.add label { display: block; font-family: var(--sans); font-size: 0.78rem;
  letter-spacing: 0.04em; text-transform: uppercase; color: var(--soft);
  margin-bottom: 0.5rem; }
.row { display: flex; gap: 0.6rem; flex-wrap: wrap; }
input[type=url], input[type=password], input[type=text] { flex: 1 1 18rem; min-width: 0; font: inherit;
  font-family: var(--sans); font-size: 0.9rem; padding: 0.55rem 0.7rem;
  border: 1px solid var(--rule); border-radius: 3px; background: var(--page);
  color: var(--ink); }
button { font-family: var(--sans); font-size: 0.88rem; padding: 0.55rem 1.1rem;
  border: 1px solid var(--accent); border-radius: 3px; background: var(--accent);
  color: #fff; cursor: pointer; }
button.ghost { background: transparent; color: var(--accent); }
button:hover { filter: brightness(1.08); }
.hint { font-size: 0.85rem; color: var(--soft); margin: 0.75rem 0 0; }
form.add .field + .field { margin-top: 1.1rem; }
form.add .repo-note { margin-top: 1.1rem; padding-top: 0.9rem; border-top: 1px solid var(--rule); }
#msg .detail { font-size: 0.85rem; color: var(--soft); margin: 0.3rem 0 0; }
#msg .warnings { margin-top: 0.7rem; border-left: 3px solid var(--accent); padding: 0.1rem 0 0.1rem 0.75rem; }
#msg .warnings-head { font-family: var(--sans); font-size: 0.8rem; text-transform: uppercase;
  letter-spacing: 0.04em; color: var(--accent); margin: 0 0 0.3rem; }
#msg .warnings ul { margin: 0; padding-left: 1.1rem; font-size: 0.88rem; }
#msg .warnings li + li { margin-top: 0.35rem; }
table.review .note.warn { color: var(--accent); }
form.add .field + .field label { margin-bottom: 0.4rem; }
#msg { margin: 0.9rem 0 0; font-size: 0.9rem; }
#msg.ok { color: #2a7d4f; } #msg.err { color: #b3412b; }

h2 { font-family: var(--sans); font-size: 0.78rem; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--soft); border-top: 1px solid var(--rule);
  padding-top: 1.1rem; margin: 0 0 1.25rem; }
[role=tablist] { display: flex; gap: 1.5rem; border-bottom: 1px solid var(--rule);
  margin: 0 0 0.5rem; }
[role=tab] { background: none; border: 0; border-bottom: 2px solid transparent;
  border-radius: 0; color: var(--soft); padding: 0.5rem 0; margin-bottom: -1px;
  font-family: var(--sans); font-size: 0.85rem; letter-spacing: 0.04em; }
[role=tab][aria-selected=true] { color: var(--ink); border-bottom-color: var(--accent); }
[role=tab]:hover { color: var(--accent); filter: none; }
[role=tab] .count { color: var(--soft); font-weight: 400; margin-left: 0.3em; }
.tabhint { font-size: 0.85rem; color: var(--soft); margin: 0.75rem 0 0.25rem; }
/* Without the script there are no tabs, and both panels stack under their own heading. */
.panel h2.nojs { margin-top: 2rem; }
.tabbed .panel h2.nojs { display: none; }
ul.blygs { list-style: none; padding: 0; margin: 0; }
ul.blygs li { padding: 0.7rem 0; border-bottom: 1px solid var(--rule); display: flex;
  gap: 0.75rem; align-items: baseline; flex-wrap: wrap; }
ul.blygs .name { font-size: 1.02rem; }
ul.blygs .host { font-family: var(--sans); font-size: 0.8rem; color: var(--soft); }
.ver { font-family: var(--sans); font-size: 0.68rem; color: var(--soft); cursor: help; }
.ver.behind { text-decoration: underline dotted; }
.health { font-family: var(--sans); font-size: 0.68rem; letter-spacing: 0.04em;
  color: #b3412b; border: 1px dashed currentColor; border-radius: 2px; padding: 0.05rem 0.4rem;
  cursor: help; }
@media (prefers-color-scheme: dark) { .health { color: #e0806a; } }
.mark { font-family: var(--sans); font-size: 0.68rem; letter-spacing: 0.06em;
  text-transform: uppercase; padding: 0.1rem 0.4rem; border-radius: 2px;
  border: 1px solid var(--rule); color: var(--soft); }
.mark.blyg { color: var(--accent); border-color: var(--accent); }
.empty { color: var(--soft); font-style: italic; }
footer { margin-top: 3.5rem; border-top: 1px solid var(--rule); padding-top: 1.1rem;
  font-family: var(--sans); font-size: 0.78rem; color: var(--soft); }

table.review { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
table.review td, table.review th { text-align: left; padding: 0.5rem 0.6rem 0.5rem 0;
  border-bottom: 1px solid var(--rule); vertical-align: top; }
table.review .note.held { color: var(--accent); }
table.review th { font-family: var(--sans); font-size: 0.72rem; text-transform: uppercase;
  letter-spacing: 0.05em; color: var(--soft); }
.status-pending { color: var(--accent); } .status-approved { color: #2a7d4f; }
.status-rejected { color: var(--soft); text-decoration: line-through; }
.note { font-size: 0.82rem; color: var(--soft); }
`;

function layout(title: string, body: string, script = ""): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="A directory of blygs — sites publishing with the Blygger protocol.">
<link rel="outline" type="text/x-opml" title="Blygs listed on blygger.com" href="/blygs.opml">
<link rel="alternate" type="application/atom+xml" title="New on blygger.com" href="/listings.xml">
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22><circle cx=%228%22 cy=%228%22 r=%227%22 fill=%22%23d95a1f%22/></svg>">
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
<header class="top">
  <a class="wordmark" href="/"><span class="dot"></span>blygger.com</a>
  <nav>
    <a href="https://blygger.org">blygger protocol ↗</a>
    <a href="https://blygger.org/start/">build a blyg ↗</a>
  </nav>
</header>
${body}
<footer>
  A directory of blygs. The protocol lives at <a href="https://blygger.org">blygger.org</a>.
  Listing is manual and a listing is not an endorsement.
</footer>
</div>
${script ? `<script>${script}</script>` : ""}
</body>
</html>`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

const SUBMIT_SCRIPT = `
(function () {
  var f = document.getElementById('add');
  if (!f) return;
  var msg = document.getElementById('msg');
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var url = document.getElementById('url').value.trim();
    if (!url) return;
    var contact = (document.getElementById('contact') || {}).value || '';
    msg.className = ''; msg.textContent = 'Checking\\u2026';
    fetch('/api/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: url, contact: contact.trim() })
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        msg.className = res.ok ? 'ok' : 'err';
        msg.textContent = res.j.message || (res.ok ? 'Submitted.' : 'Something went wrong.');
        if (res.j.detail && !res.j.listed) {
          var d = document.createElement('p');
          d.className = 'detail';
          d.textContent = res.j.detail;
          msg.appendChild(d);
        }
        // Warnings are things only the operator can fix, and this is the one
        // moment we reliably have their attention. The listing is not withheld
        // for them, so the wording has to say both: you are in, and here is
        // what to sort out.
        var w = res.j.warnings || [];
        if (w.length) {
          var box = document.createElement('div');
          box.className = 'warnings';
          var h = document.createElement('p');
          h.className = 'warnings-head';
          h.textContent = w.length === 1
            ? 'Listed, with one thing to look at:'
            : 'Listed, with ' + w.length + ' things to look at:';
          box.appendChild(h);
          var ul = document.createElement('ul');
          w.forEach(function (line) {
            var li = document.createElement('li');
            li.textContent = line;
            ul.appendChild(li);
          });
          box.appendChild(ul);
          msg.appendChild(box);
        }
        if (res.ok) f.reset();
      })
      .catch(function () { msg.className = 'err'; msg.textContent = 'Network error \\u2014 try again.'; });
  });
})();
`;

// Tabs over two server-rendered lists. With no script both panels show,
// stacked under their own headings, so the directory never depends on JS.
const TABS_SCRIPT = `
(function () {
  var root = document.getElementById('dir');
  if (!root) return;
  var tabs = Array.prototype.slice.call(root.querySelectorAll('[role=tab]'));
  function show(name, focus) {
    tabs.forEach(function (t) {
      var on = t.dataset.tab === name;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
      if (on && focus) t.focus();
    });
  }
  root.classList.add('tabbed');
  root.querySelector('[role=tablist]').hidden = false;
  show(location.hash === '#legacy' ? 'legacy' : 'blygs');
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () {
      show(t.dataset.tab);
      history.replaceState(null, '', t.dataset.tab === 'legacy' ? '#legacy' : location.pathname);
    });
    t.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      show(tabs[(i + d + tabs.length) % tabs.length].dataset.tab, true);
    });
  });
})();
`;

/**
 * The manifest's declared version, quietly. Behind-current is noted, not
 * flagged: a 0.2 blyg is a conformant 0.2 blyg, and nothing is withdrawn for
 * it. Generator and level go in the tooltip — informative only (§3.2).
 */
function versionMark(r: PublicRow): string {
  if (r.kind !== "blyg" || !r.protocol) return "";
  const behind = protocolBehind(r.protocol, CURRENT_PROTOCOL);
  const bits = [
    `protocol ${r.protocol}${behind ? ` (current is ${CURRENT_PROTOCOL})` : ""}`,
    r.level != null ? `level ${r.level}` : null,
    r.generator ? `generator: ${r.generator}` : null,
  ].filter(Boolean);
  return `<span class="ver${behind ? " behind" : ""}" title="${escapeHtml(bits.join(" · "))}">v${escapeHtml(r.protocol)}</span>`;
}

function listItems(rows: PublicRow[], mark: string, now: Date): string {
  return rows
    .map((r) => {
      const home = r.home_url ?? "";
      const name = r.title?.trim() || hostOf(home);
      // Re-check findings only (health.ts) — never what was seen at submission.
      const health = publicMarks(r, now)
        .map((m) => `<span class="health" title="${escapeHtml(m.title)}">${escapeHtml(m.label)}</span>`)
        .join("");
      return `  <li>${mark}<a class="name" href="${escapeHtml(home)}">${escapeHtml(name)}</a>` +
        `<span class="host">${escapeHtml(hostOf(home))}</span>${versionMark(r)}${health}</li>`;
    })
    .join("\n");
}

export function publicPage(rows: PublicRow[], now = new Date()): string {
  const blygs = rows.filter((r) => r.kind === "blyg");
  const legacy = rows.filter((r) => r.kind !== "blyg");

  const blygList = blygs.length
    ? `<ul class="blygs">\n${listItems(blygs, '<span class="mark blyg" title="resolves as a blyg">blyg</span>', now)}\n</ul>`
    : `<p class="empty">No blygs listed yet.</p>`;
  const legacyList = legacy.length
    ? `<ul class="blygs">\n${listItems(legacy, '<span class="mark" title="a plain RSS or Atom feed">feed</span>', now)}\n</ul>`
    : `<p class="empty">No feeds listed yet.</p>`;

  const body = `<h1>A directory of blygs</h1>
<p class="lede">Sites publishing with the <a href="https://blygger.org">Blygger protocol</a> —
and a few plain feeds worth reading. Links go to the site itself, not to its feed.</p>

<details class="add-wrap">
<summary>+ Add a blyg or feed</summary>
<form class="add" id="add">
  <div class="field">
    <label for="url">Add your blyg</label>
    <div class="row">
      <input type="url" id="url" name="url" placeholder="https://yoursite.com/blyg/" required>
      <button type="submit">Submit</button>
    </div>
    <p class="hint">Your site URL or your feed URL — either works. We resolve it the way a
      blyg client would, and if it resolves cleanly it is listed straight away. A few
      things hold a submission for a human to look at — a manifest claiming an origin it
      is not served from, a plaintext link, a name another listing already uses — and
      you are told which.</p>
  </div>
  <div class="field">
    <label for="contact">Contact (optional)</label>
    <div class="row">
      <input type="text" id="contact" name="contact" placeholder="email, handle, or a contact page"
        autocomplete="email" maxlength="200">
    </div>
    <p class="hint"><strong>Never published, and never shown to anyone but us.</strong>
      It is here for one purpose: if the software running your blyg gets a security
      fix, this is how we tell you. A directory that publishes your origin and
      cannot reach you is exactly the situation we were in this month.</p>
  </div>
  <p id="msg"></p>
  <p class="hint repo-note"><strong>Built or modified a client?</strong> That is a
    different thing from the site you just submitted, and it belongs on the
    <a href="https://blygger.org/ecosystem/">ecosystem page</a> —
    <a href="https://github.com/blygger/blygger-org/issues/new?template=project.yml">submit the
    repo here</a>. Half-finished is fine; so is someone else's, and we will check with
    them. Worth doing even for a fork or a private mod: the census can see that
    <em>some</em> client published a blyg, because the manifest carries a
    <code>generator</code> string — it cannot see whose it is or where to read the code.</p>
</form>
</details>

<section id="dir">
<div role="tablist" aria-label="Directory" hidden>
  <button type="button" role="tab" id="tab-blygs" data-tab="blygs" aria-controls="panel-blygs">Blygs<span class="count">${blygs.length}</span></button>
  <button type="button" role="tab" id="tab-legacy" data-tab="legacy" aria-controls="panel-legacy">Legacy RSS<span class="count">${legacy.length}</span></button>
</div>
<div class="panel" role="tabpanel" id="panel-blygs" aria-labelledby="tab-blygs">
<h2 class="nojs">Blygs</h2>
<p class="tabhint">Every blyg below, as one file a feed reader or agent can import:
  <a href="/blygs.opml">blygs.opml</a>. To hear about new ones, subscribe to
  <a href="/listings.xml">listings.xml</a>.</p>
<p class="tabhint">Every listing is re-checked several times a day. A dashed mark is
  something the last check found. A blyg unreachable for three days, or carrying a
  defect for two weeks, is left out of both files until it is fixed — it stays listed
  here.</p>
${blygList}
</div>
<div class="panel" role="tabpanel" id="panel-legacy" aria-labelledby="tab-legacy">
<h2 class="nojs">Legacy RSS</h2>
<p class="tabhint">Plain RSS and Atom feeds — readable, but not speaking the protocol.</p>
${legacyList}
</div>
</section>`;
  return layout("blygger.com — a directory of blygs", body, SUBMIT_SCRIPT + TABS_SCRIPT);
}

export function loginPage(error = false): string {
  const body = `<h1>Review</h1>
<form class="add" method="POST" action="/admin/login">
  <label for="pw">Owner password</label>
  <div class="row">
    <input type="password" id="pw" name="password" required autofocus>
    <button type="submit">Sign in</button>
  </div>
  ${error ? '<p id="msg" class="err">Incorrect.</p>' : ""}
</form>`;
  return layout("Review — blygger.com", body);
}

const ADMIN_SCRIPT = `
(function () {
  // Re-run the listing rules over the whole queue. Reports what it did rather
  // than reloading silently: a bulk action whose only feedback is a changed
  // page is one you cannot tell succeeded from one that found nothing to do.
  document.addEventListener('click', function (e) {
    var r = e.target.closest('#recheck');
    if (!r) return;
    e.preventDefault();
    r.disabled = true;
    fetch('/admin/recheck', { method: 'POST' })
      .then(function (res) { return res.ok ? res.json() : Promise.reject(); })
      .then(function (out) {
        if (!out.checked) { r.disabled = false; r.textContent = 'nothing queued'; return; }
        location.reload();
      })
      .catch(function () { r.disabled = false; alert('Recheck failed.'); });
  });

  document.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]');
    if (!b) return;
    e.preventDefault();
    b.disabled = true;
    fetch('/admin/review/' + b.dataset.id, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: b.dataset.act })
    }).then(function (r) {
      if (r.ok) { location.reload(); return; }
      b.disabled = false;
      alert('Failed \\u2014 try again.');
    }).catch(function () { b.disabled = false; alert('Network error.'); });
  });
})();
`;

function healthNote(r: SubmissionRow, now: Date): string {
  if (r.status !== "approved") return "";
  if (!r.last_checked_at) return `<div class="note">health: not checked yet</div>`;
  const when = r.last_checked_at.slice(0, 16).replace("T", " ");
  const detail = r.health_note ? ` — ${escapeHtml(r.health_note)}` : "";
  const out = isWithdrawn(r, now) ? " · withdrawn from OPML and feed" : "";
  if (r.failing_since) {
    return `<div class="note warn">health: failing since ${escapeHtml(r.failing_since.slice(0, 16).replace("T", " "))}${out}${detail}</div>`;
  }
  const defects = parseFlags(r.flags).filter((c) => DEFECTS.has(c));
  if (defects.length) {
    return `<div class="note warn">health: ${escapeHtml(defects.join(", "))} since ${escapeHtml((r.defect_since ?? "").slice(0, 10))} (checked ${escapeHtml(when)})${out}${detail}</div>`;
  }
  return `<div class="note">health: ok at ${escapeHtml(when)}${detail}</div>`;
}

function unlistedSection(unlisted: UnlistedBlyg[]): string {
  if (!unlisted.length) return "";
  return `<h2 style="margin-top:3rem">Seen in blogrolls, not listed</h2>
<p class="note">Blygs that listed blygs follow. Not shown publicly and never listed from here —
  the directory lists blygs that list themselves. People to invite.</p>
<table class="review">
<thead><tr><th>Blyg</th><th>Seen on</th><th>First seen</th></tr></thead>
<tbody>
${unlisted
  .map(
    (u) => `<tr><td><a href="${escapeHtml(u.origin)}">${escapeHtml(u.title?.trim() || hostOf(u.origin))}</a>
  <div class="note">${escapeHtml(u.origin)}</div></td>
  <td class="note">${escapeHtml(hostOf(u.seen_on))}</td>
  <td class="note">${escapeHtml(u.first_seen_at.slice(0, 10))}</td></tr>`,
  )
  .join("\n")}
</tbody>
</table>`;
}

export function adminPage(rows: SubmissionRow[], unlisted: UnlistedBlyg[] = [], now = new Date()): string {
  const body = rows.length
    ? `<h1>Review</h1>
<p class="lede">${rows.filter((r) => r.status === "pending").length} pending of ${rows.length}.
  ${rows.some((r) => r.status === "pending") ? '<button class="ghost" id="recheck">recheck queue</button>' : ""}</p>
<table class="review">
<thead><tr><th>Site</th><th>Kind</th><th>Contact</th><th>Status</th><th></th></tr></thead>
<tbody>
${rows
  .map((r) => {
    const home = r.home_url ?? r.submitted_url;
    const note = r.resolve_note ? `<div class="note">${escapeHtml(r.resolve_note)}</div>` : "";
    // Why this one is waiting. Without it the queue is a list of things that
    // look fine, and the reviewer has to re-derive the finding that held them.
    const held = r.review_reason ? `<div class="note held">held: ${escapeHtml(r.review_reason)}</div>` : "";
    // Listed-with-warnings rows are the common case now, and the queue is where
    // we would notice a warning nobody ever acts on.
    let warned = "";
    try {
      const w = JSON.parse(r.warnings ?? "[]") as string[];
      if (Array.isArray(w) && w.length) {
        warned = `<div class="note warn">${w.map((x) => escapeHtml(x)).join("<br>")}</div>`;
      }
    } catch {
      warned = "";
    }
    return `<tr>
  <td><a href="${escapeHtml(home)}">${escapeHtml(r.title?.trim() || hostOf(home))}</a>
      <div class="note">submitted: ${escapeHtml(r.submitted_url)}</div>${note}${held}${warned}${healthNote(r, now)}</td>
  <td>${escapeHtml(r.kind ?? "—")}${r.protocol ? `<div class="note">v${escapeHtml(r.protocol)}${r.level != null ? ` L${r.level}` : ""}</div>` : ""}${r.generator ? `<div class="note">${escapeHtml(r.generator)}</div>` : ""}</td>
  <td class="note">${r.contact ? escapeHtml(r.contact) : "—"}</td>
  <td class="status-${escapeHtml(r.status)}">${escapeHtml(r.status)}</td>
  <td>
    ${r.status !== "approved" ? `<button data-act="approved" data-id="${escapeHtml(r.id)}">approve</button> ` : ""}
    ${r.status !== "rejected" ? `<button class="ghost" data-act="rejected" data-id="${escapeHtml(r.id)}">reject</button>` : ""}
  </td>
</tr>`;
  })
  .join("\n")}
</tbody>
</table>`
    : `<h1>Review</h1><p class="empty">No submissions yet.</p>`;
  return layout("Review — blygger.com", body + unlistedSection(unlisted), ADMIN_SCRIPT);
}

/**
 * The feed a subscriber should follow. Under 0.3 the feed path is
 * protocol-fixed (§4), so a blyg's is `{origin}feed.xml`; a legacy row's
 * origin already *is* its feed URL. At 0.4 the manifest's `feed` key becomes
 * authoritative (§16) and this has to come from a stored resolution instead.
 */
export function feedUrlOf(r: PublicRow): string | null {
  if (!r.origin) return null;
  if (r.kind !== "blyg") return r.origin;
  try {
    return new URL("feed.xml", r.origin).toString();
  } catch {
    return null;
  }
}

/**
 * The blygs the machine surfaces hand out: listed, and not withdrawn — not
 * unreachable for 72 hours, not carrying a defect for 14 days (health.ts). A
 * withdrawn listing stays on the page, marked; an agent following the export
 * should not be sent to it until it is fixed.
 */
function machineBlygs(rows: PublicRow[], now: Date): PublicRow[] {
  return rows.filter((r) => r.kind === "blyg" && !isWithdrawn(r, now));
}

/**
 * Every listed blyg as OPML 2.0, in exactly the shape of a §11 blogroll: one
 * flat outline per feed, no blyg-specific attributes. A consumer resolving
 * each xmlUrl through §12 gets the blyg upgrade from the feed itself.
 * Rendered per request from the same approved-only query as the page, so it
 * is current the moment a listing is.
 */
export function blygsOpml(rows: PublicRow[], now = new Date()): string {
  const blygs = machineBlygs(rows, now);
  const latest = blygs.reduce((m, r) => (r.listed_at > m ? r.listed_at : m), "");
  const outlines = blygs
    .map((r) => {
      const xml = feedUrlOf(r);
      if (!xml) return "";
      const home = r.home_url ?? r.origin ?? "";
      const name = escapeHtml(r.title?.trim() || hostOf(home));
      return `    <outline type="rss" text="${name}" title="${name}" xmlUrl="${escapeHtml(xml)}" htmlUrl="${escapeHtml(home)}" />`;
    })
    .filter(Boolean)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Blygs listed on blygger.com</title>
${latest ? `    <dateModified>${new Date(latest).toUTCString()}</dateModified>\n` : ""}    <docs>https://opml.org/spec2.opml</docs>
  </head>
  <body>
${outlines}
  </body>
</opml>
`;
}

/** Atom wants RFC 3339; stored timestamps are ISO already, but be strict about it. */
function rfc3339(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? new Date(0).toISOString() : new Date(t).toISOString();
}

/**
 * New listings as an Atom feed — the push half of /blygs.opml. Anything that
 * follows feeds (a blyg among them) can subscribe and learn about new blygs
 * without diffing the OPML file. Blygs only, newest first, capped; an entry's
 * id is the blyg's origin, which is its identity in the protocol (§12.2), so
 * a re-listing is the same entry rather than a new one.
 */
export function listingsAtom(rows: PublicRow[], now = new Date()): string {
  const blygs = machineBlygs(rows, now)
    .slice()
    .sort((a, b) => (a.listed_at < b.listed_at ? 1 : -1))
    .slice(0, 50);
  const updated = blygs.length ? rfc3339(blygs[0].listed_at) : rfc3339("2026-09-16T00:00:00Z");
  const entries = blygs
    .map((r) => {
      const home = r.home_url ?? r.origin ?? "";
      const feed = feedUrlOf(r);
      const name = escapeHtml(r.title?.trim() || hostOf(home));
      const when = rfc3339(r.listed_at);
      return `  <entry>
    <id>${escapeHtml(r.origin ?? home)}</id>
    <title>${name}</title>
    <link rel="alternate" type="text/html" href="${escapeHtml(home)}"/>
${feed ? `    <link rel="related" type="application/rss+xml" href="${escapeHtml(feed)}"/>\n` : ""}    <published>${when}</published>
    <updated>${when}</updated>
    <summary>${name} (${escapeHtml(hostOf(home))}) listed itself on blygger.com.${feed ? ` Feed: ${escapeHtml(feed)}` : ""}</summary>
  </entry>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>https://blygger.com/listings.xml</id>
  <title>New on blygger.com</title>
  <subtitle>Blygs as they list themselves in the directory.</subtitle>
  <link rel="self" type="application/atom+xml" href="https://blygger.com/listings.xml"/>
  <link rel="alternate" type="text/html" href="https://blygger.com/"/>
  <link rel="related" type="text/x-opml" href="https://blygger.com/blygs.opml"/>
  <author><name>blygger.com</name></author>
  <updated>${updated}</updated>
${entries}
</feed>
`;
}
