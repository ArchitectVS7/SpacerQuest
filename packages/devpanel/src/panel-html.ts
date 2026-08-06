/**
 * T-143 · THE PANEL PAGE — spec §4's launcher, live output stream and run history.
 *
 * PURE: one exported function, string in / string out. No `node:fs`, no clock, no
 * network — the page is a value, so `__tests__` can assert on its contents
 * without starting a server.
 *
 * SELF-CONTAINED, AND THAT IS A REQUIREMENT RATHER THAN A STYLE: zero external
 * requests (no CDN, no webfont, no image host). A dev tool that spawns child
 * processes on your machine must not also be a page that phones out — and a
 * loopback-only server cannot serve a resource it does not host anyway.
 *
 * THE FORMS ARE GENERATED FROM THE REGISTRY THAT IS PASSED IN. There is
 * deliberately no second copy of the flag list here: a field cannot exist in the
 * UI without existing in `./commands.ts`, which is what makes "no flag invented
 * that the underlying script doesn't accept" (§6) a structural property instead
 * of a review item.
 *
 * WHAT YOU SEE IS WHAT RUNS. Every command line is rendered from the server's own
 * plan before the run starts, including the two directory flags the panel injects
 * for a sweep (`./runner.ts`). Nothing is spawned that the operator was not shown.
 */

import type { PanelCommand } from './commands.js';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Embedded as JSON inside a `<script>`; `<` is escaped so a value can never close the tag. */
function embedJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export interface PanelPageInput {
  readonly commands: readonly PanelCommand[];
  readonly token: string;
  readonly repoRoot: string;
  readonly runsRoot: string;
}

export function renderPanelPage(input: PanelPageInput): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Rimward dev control panel</title>
<style>
:root {
  color-scheme: dark;
  --bg: #0f1216; --panel: #171b21; --edge: #2a313a; --ink: #e6eaef; --dim: #93a0b0;
  --accent: #6ea8fe; --ok: #4ec9a0; --bad: #f2777a; --warn: #e6b455;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink);
  font: 14px/1.5 system-ui, -apple-system, Segoe UI, sans-serif; }
header { padding: 18px 22px; border-bottom: 1px solid var(--edge); }
h1 { margin: 0 0 4px; font-size: 17px; letter-spacing: .01em; }
.sub { color: var(--dim); font-size: 12.5px; }
main { display: grid; grid-template-columns: minmax(360px, 460px) 1fr; gap: 0; align-items: start; }
@media (max-width: 900px) { main { grid-template-columns: 1fr; } }
.col { padding: 18px 22px; min-width: 0; }
.col + .col { border-left: 1px solid var(--edge); }
@media (max-width: 900px) { .col + .col { border-left: 0; border-top: 1px solid var(--edge); } }
details.cmd { border: 1px solid var(--edge); border-radius: 8px; background: var(--panel);
  margin-bottom: 12px; }
details.cmd > summary { cursor: pointer; padding: 11px 13px; font-weight: 600; list-style: none; }
details.cmd > summary::-webkit-details-marker { display: none; }
details.cmd > summary::before { content: "\\25B8 "; color: var(--dim); }
details.cmd[open] > summary::before { content: "\\25BE "; }
.body { padding: 0 13px 13px; }
.blurb { color: var(--dim); font-size: 12.5px; margin: 0 0 10px; }
label { display: block; margin: 9px 0 0; font-size: 12.5px; }
label .help { display: block; color: var(--dim); font-size: 11.5px; margin-top: 2px; }
input[type=text], input[type=number] { width: 100%; margin-top: 3px; padding: 6px 8px;
  background: #10141a; border: 1px solid var(--edge); border-radius: 5px; color: var(--ink);
  font-family: var(--mono); font-size: 12.5px; }
input[type=checkbox] { margin-right: 6px; }
button { margin-top: 12px; padding: 7px 14px; border-radius: 6px; border: 1px solid var(--accent);
  background: #1b2735; color: var(--ink); font-weight: 600; cursor: pointer; }
button:hover { background: #223247; }
button.danger { border-color: var(--bad); background: #2a1a1c; }
pre { font-family: var(--mono); font-size: 12px; white-space: pre-wrap; word-break: break-word; }
.plan { background: #10141a; border: 1px dashed var(--edge); border-radius: 6px; padding: 8px;
  margin: 10px 0 0; color: var(--dim); }
#stream { background: #0b0e12; border: 1px solid var(--edge); border-radius: 8px; padding: 10px;
  height: 46vh; overflow: auto; margin: 0; }
#stream .l-stderr { color: var(--warn); }
#stream .l-note { color: var(--bad); font-weight: 600; }
#stream .l-spawn { color: var(--accent); }
#stream .l-exit { color: var(--ok); }
.run { border: 1px solid var(--edge); border-radius: 8px; background: var(--panel);
  padding: 10px 12px; margin-bottom: 10px; }
.run h3 { margin: 0 0 4px; font-size: 13.5px; }
.run .meta { color: var(--dim); font-size: 11.5px; font-family: var(--mono);
  overflow-x: auto; }
.badge { display: inline-block; padding: 1px 7px; border-radius: 999px; font-size: 11px;
  font-weight: 700; }
.badge.ok { background: #12332a; color: var(--ok); }
.badge.failed { background: #33191b; color: var(--bad); }
.badge.running { background: #1c2838; color: var(--accent); }
.warnbar { border: 1px solid var(--bad); background: #2a1a1c; border-radius: 8px;
  padding: 9px 12px; margin: 0 0 12px; font-size: 12.5px; }
a { color: var(--accent); }
.scroll { overflow-x: auto; }
</style>
</head>
<body>
<header>
  <h1>Rimward dev control panel <span class="sub">— dev-only, loopback-only, never shipped</span></h1>
  <div class="sub">
    repo <code>${escapeHtml(input.repoRoot)}</code> · runs land in
    <code>${escapeHtml(input.runsRoot)}</code> (gitignored via <code>.scratch/</code>)
  </div>
  <div class="sub">
    Every action here spawns the existing CLI as a child process. Nothing reimplements sweep,
    aggregate, extract or diff logic. <code>format</code> and <code>lint:fix</code> are
    deliberately absent — see §7 of the spec.
  </div>
</header>
<main>
  <section class="col">
    <h2 style="font-size:13px;color:var(--dim);margin:0 0 10px;text-transform:uppercase;letter-spacing:.08em">Commands</h2>
    <div id="forms"></div>
  </section>
  <section class="col">
    <h2 style="font-size:13px;color:var(--dim);margin:0 0 10px;text-transform:uppercase;letter-spacing:.08em">Live output</h2>
    <pre id="stream">idle — pick a command on the left.</pre>
    <h2 style="font-size:13px;color:var(--dim);margin:18px 0 10px;text-transform:uppercase;letter-spacing:.08em">Run history</h2>
    <div id="history"></div>
  </section>
</main>
<script id="panel-data" type="application/json">${embedJson({
    commands: input.commands,
    token: input.token,
  })}</script>
<script>
(function () {
  var DATA = JSON.parse(document.getElementById('panel-data').textContent);
  var TOKEN = DATA.token;
  var streamEl = document.getElementById('stream');
  var historyEl = document.getElementById('history');
  var source = null;

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function line(kind, stream, text) {
    var div = document.createElement('div');
    div.className = 'l-' + kind;
    div.textContent = (stream ? '[' + stream + '] ' : '') + text;
    streamEl.appendChild(div);
    streamEl.scrollTop = streamEl.scrollHeight;
  }
  function post(path, body) {
    return fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-panel-token': TOKEN },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, json: j }; }); });
  }

  function field(cmd, flag) {
    var id = 'f-' + cmd.id + '-' + flag.id;
    if (flag.kind === 'boolean') {
      return '<label><input type="checkbox" id="' + id + '" />' + esc(flag.flag) +
        '<span class="help">' + esc(flag.help) + '</span></label>';
    }
    var name = flag.kind === 'positional' ? flag.id : flag.flag;
    return '<label>' + esc(name) + (flag.required ? ' *' : '') +
      '<input type="text" id="' + id + '" spellcheck="false" />' +
      '<span class="help">' + esc(flag.help) + '</span></label>';
  }

  function readValues(cmd) {
    var values = {};
    cmd.flags.forEach(function (flag) {
      var el = document.getElementById('f-' + cmd.id + '-' + flag.id);
      if (!el) return;
      if (flag.kind === 'boolean') { if (el.checked) values[flag.id] = 'true'; return; }
      var v = el.value.trim();
      if (v === '') return;
      // A repeatable flag takes one value per line, so a path with a space is
      // still one path — splitting on whitespace would break exactly the case
      // this repo's .scratch paths hit on macOS.
      values[flag.id] = flag.repeatable ? v.split('\\n').map(function (s) { return s.trim(); })
        .filter(function (s) { return s !== ''; }) : v;
    });
    return values;
  }

  function renderForms() {
    DATA.commands.forEach(function (cmd) {
      var d = document.createElement('details');
      d.className = 'cmd';
      var shard = cmd.id === 'sweep'
        ? '<label>shard count <span class="help">N concurrent child processes, then one --merge. ' +
          'The panel owns --shard and --merge; they are not fields.</span>' +
          '<input type="number" min="1" max="32" value="4" id="f-sweep-shardCount" /></label>'
        : '';
      var warn = cmd.writesOutsideScratch
        ? '<div class="warnbar">This command can write outside .scratch/. Leave --out and ' +
          '--aggregate-out blank and the panel points both at this run\\u2019s gitignored ' +
          'directory instead of docs/balance.</div>'
        : '';
      d.innerHTML = '<summary>' + esc(cmd.title) + '</summary><div class="body">' +
        '<p class="blurb">' + esc(cmd.blurb) + '</p>' + warn + shard +
        cmd.flags.map(function (f) { return field(cmd, f); }).join('') +
        '<div><button data-plan="' + cmd.id + '">Preview command</button> ' +
        '<button data-run="' + cmd.id + '">Run</button></div>' +
        '<pre class="plan" id="plan-' + cmd.id + '">no plan yet</pre></div>';
      document.getElementById('forms').appendChild(d);
    });

    document.getElementById('forms').addEventListener('click', function (ev) {
      var planId = ev.target.getAttribute && ev.target.getAttribute('data-plan');
      var runId = ev.target.getAttribute && ev.target.getAttribute('data-run');
      if (planId) { ev.preventDefault(); doPlan(planId); }
      if (runId) { ev.preventDefault(); doRun(runId); }
    });
  }

  function payload(id) {
    var cmd = DATA.commands.filter(function (c) { return c.id === id; })[0];
    var shardEl = document.getElementById('f-sweep-shardCount');
    return {
      commandId: id,
      values: readValues(cmd),
      shardCount: id === 'sweep' && shardEl ? Number(shardEl.value) : 1
    };
  }

  function doPlan(id) {
    post('/api/plan', payload(id)).then(function (res) {
      var el = document.getElementById('plan-' + id);
      el.textContent = res.ok ? res.json.commandLines.join('\\n') : ('ERROR: ' + res.json.error);
    });
  }

  function doRun(id) {
    post('/api/run', payload(id)).then(function (res) {
      if (!res.ok) { line('note', id, 'ERROR: ' + res.json.error); return; }
      document.getElementById('plan-' + id).textContent = res.json.commandLines.join('\\n');
      streamEl.textContent = '';
      line('note', '', 'run ' + res.json.id + ' -> ' + res.json.runDir);
      // The command lines are NOT echoed here: the SSE stream replays a 'spawn'
      // event for each one, and printing both showed every invocation twice.
      attach(res.json.id);
    });
  }

  function attach(runId) {
    if (source) source.close();
    source = new EventSource('/api/runs/' + encodeURIComponent(runId) + '/stream');
    source.onmessage = function (ev) {
      var e = JSON.parse(ev.data);
      if (e.kind === 'done') { source.close(); source = null; refreshHistory(); return; }
      line(e.kind, e.stream, (e.text !== undefined ? e.text : (e.commandLine || ('exit ' + e.code))).replace(/\\n$/, ''));
    };
  }

  function runCard(r) {
    var links = (r.outputs || []).map(function (o) {
      return '<a href="' + esc(o.href) + '" target="_blank" rel="noreferrer">' + esc(o.name) + '</a>';
    }).join(' · ');
    var promote = (r.promotable || []).map(function (p) {
      return '<button class="danger" data-promote="' + esc(r.id) + '" data-file="' + esc(p) + '">' +
        'Promote ' + esc(p) + ' to docs/balance</button>';
    }).join(' ');
    return '<div class="run"><h3>' + esc(r.title) +
      ' <span class="badge ' + esc(r.status) + '">' + esc(r.status) + '</span></h3>' +
      '<div class="meta scroll">' + esc(r.startedAt) + ' · exit ' + esc(String(r.exitCode)) +
      (r.shardCount > 1 ? ' · ' + r.shardCount + ' shards' : '') + '</div>' +
      '<div class="meta scroll">' + esc(r.runDir) + '</div>' +
      '<pre class="plan">' + esc((r.commandLines || []).join('\\n')) + '</pre>' +
      (links ? '<div class="meta">' + links + '</div>' : '') +
      (r.status === 'ok' && r.commandId === 'sweep'
        ? '<div><button data-report="' + esc(r.id) + '">View Report</button> ' + promote + '</div>'
        : '') +
      '</div>';
  }

  function refreshHistory() {
    fetch('/api/runs').then(function (r) { return r.json(); }).then(function (runs) {
      historyEl.innerHTML = runs.map(runCard).join('') || '<p class="sub">no runs yet</p>';
    });
  }

  historyEl.addEventListener('click', function (ev) {
    var reportId = ev.target.getAttribute && ev.target.getAttribute('data-report');
    var promoteId = ev.target.getAttribute && ev.target.getAttribute('data-promote');
    if (reportId) {
      ev.preventDefault();
      post('/api/report', { runId: reportId }).then(function (res) {
        if (!res.ok) { line('note', 'report', 'ERROR: ' + res.json.error); return; }
        streamEl.textContent = '';
        attach(res.json.id);
      });
    }
    if (promoteId) {
      ev.preventDefault();
      var file = ev.target.getAttribute('data-file');
      // A TYPED CONFIRMATION, not a bare click. Promotion is the only action in
      // this panel that writes outside .scratch/, and docs/VERSIONING.md wants a
      // baseline pointer move to be a deliberate act.
      var typed = window.prompt('Promotion is the only panel action that writes outside ' +
        '.scratch/. Type the filename to confirm:', '');
      if (typed !== file) { line('note', 'promote', 'cancelled (filename did not match)'); return; }
      post('/api/promote', { runId: promoteId, file: file, confirm: typed }).then(function (res) {
        if (!res.ok) { line('note', 'promote', 'ERROR: ' + res.json.error); return; }
        line('note', 'promote', 'copied to ' + res.json.dest +
          ' — NOT committed. Run these yourself:');
        res.json.gitLines.forEach(function (g) { line('exit', 'promote', g); });
      });
    }
  });

  renderForms();
  refreshHistory();
})();
</script>
</body>
</html>
`;
}
