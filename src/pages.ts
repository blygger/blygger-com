// The whole site: one public page, one admin page. Server-rendered, no build
// step, no framework. The visual language deliberately echoes blygger.org
// (monospace wordmark, orange accent, generous measure) so the two read as one
// project without sharing a stylesheet across origins.

import type { SubmissionRow } from "./types.ts";
import { escapeHtml } from "./util.ts";

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
form.add label { display: block; font-family: var(--sans); font-size: 0.78rem;
  letter-spacing: 0.04em; text-transform: uppercase; color: var(--soft);
  margin-bottom: 0.5rem; }
.row { display: flex; gap: 0.6rem; flex-wrap: wrap; }
input[type=url], input[type=password] { flex: 1 1 18rem; min-width: 0; font: inherit;
  font-family: var(--sans); font-size: 0.9rem; padding: 0.55rem 0.7rem;
  border: 1px solid var(--rule); border-radius: 3px; background: var(--page);
  color: var(--ink); }
button { font-family: var(--sans); font-size: 0.88rem; padding: 0.55rem 1.1rem;
  border: 1px solid var(--accent); border-radius: 3px; background: var(--accent);
  color: #fff; cursor: pointer; }
button.ghost { background: transparent; color: var(--accent); }
button:hover { filter: brightness(1.08); }
.hint { font-size: 0.85rem; color: var(--soft); margin: 0.75rem 0 0; }
#msg { margin: 0.9rem 0 0; font-size: 0.9rem; }
#msg.ok { color: #2a7d4f; } #msg.err { color: #b3412b; }

h2 { font-family: var(--sans); font-size: 0.78rem; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--soft); border-top: 1px solid var(--rule);
  padding-top: 1.1rem; margin: 0 0 1.25rem; }
ul.blygs { list-style: none; padding: 0; margin: 0; }
ul.blygs li { padding: 0.7rem 0; border-bottom: 1px solid var(--rule); display: flex;
  gap: 0.75rem; align-items: baseline; flex-wrap: wrap; }
ul.blygs .name { font-size: 1.02rem; }
ul.blygs .host { font-family: var(--sans); font-size: 0.8rem; color: var(--soft); }
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
    msg.className = ''; msg.textContent = 'Checking\\u2026';
    fetch('/api/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: url })
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        msg.className = res.ok ? 'ok' : 'err';
        msg.textContent = res.j.message || (res.ok ? 'Submitted.' : 'Something went wrong.');
        if (res.ok) f.reset();
      })
      .catch(function () { msg.className = 'err'; msg.textContent = 'Network error \\u2014 try again.'; });
  });
})();
`;

export function publicPage(rows: SubmissionRow[]): string {
  const items = rows
    .map((r) => {
      const home = r.home_url ?? "";
      const name = r.title?.trim() || hostOf(home);
      const mark =
        r.kind === "blyg"
          ? '<span class="mark blyg" title="resolves as a blyg">blyg</span>'
          : '<span class="mark" title="a plain RSS or Atom feed">feed</span>';
      return `  <li>${mark}<a class="name" href="${escapeHtml(home)}">${escapeHtml(name)}</a>` +
        `<span class="host">${escapeHtml(hostOf(home))}</span></li>`;
    })
    .join("\n");

  const list = rows.length
    ? `<ul class="blygs">\n${items}\n</ul>`
    : `<p class="empty">Nothing listed yet.</p>`;

  const body = `<h1>A directory of blygs</h1>
<p class="lede">Sites publishing with the <a href="https://blygger.org">Blygger protocol</a> —
and a few plain feeds worth reading. Links go to the site itself, not to its feed.</p>

<form class="add" id="add">
  <label for="url">Add your blyg</label>
  <div class="row">
    <input type="url" id="url" name="url" placeholder="https://yoursite.com/blyg/" required>
    <button type="submit">Submit</button>
  </div>
  <p class="hint">Your site URL or your feed URL — either works. We resolve it the way a
    blyg client would, then a human looks at it before it appears here.</p>
  <p id="msg"></p>
</form>

<h2>Listed</h2>
${list}`;
  return layout("blygger.com — a directory of blygs", body, SUBMIT_SCRIPT);
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

export function adminPage(rows: SubmissionRow[]): string {
  const body = rows.length
    ? `<h1>Review</h1>
<p class="lede">${rows.filter((r) => r.status === "pending").length} pending of ${rows.length}.</p>
<table class="review">
<thead><tr><th>Site</th><th>Kind</th><th>Status</th><th></th></tr></thead>
<tbody>
${rows
  .map((r) => {
    const home = r.home_url ?? r.submitted_url;
    const note = r.resolve_note ? `<div class="note">${escapeHtml(r.resolve_note)}</div>` : "";
    return `<tr>
  <td><a href="${escapeHtml(home)}">${escapeHtml(r.title?.trim() || hostOf(home))}</a>
      <div class="note">submitted: ${escapeHtml(r.submitted_url)}</div>${note}</td>
  <td>${escapeHtml(r.kind ?? "—")}</td>
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
  return layout("Review — blygger.com", body, ADMIN_SCRIPT);
}
