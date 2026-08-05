#!/usr/bin/env node
// ---------------------------------------------------------------------------
// T-204 · THE PROSE SCAN — "authored string values only", made re-runnable.
//
// T-204 renamed "Hangout" to "Cantina" in every PLAYER-FACING surface and
// deliberately left every internal identifier alone (`hangout.ts`, `HangoutTone`,
// `PORT_HANGOUTS`, the save literal `'VisitHangout'`, test names, comments). Its
// Accept clause asks for "zero hits" from a case-insensitive grep over
// `packages/ui/src`, `packages/desktop` and "every content file's authored
// STRING VALUES (prose/tone/copy fields, not field/type names)".
//
// A RAW `grep -i` CANNOT ANSWER THAT QUESTION. It sees identifiers, imports,
// comments, `data-testid`s and CSS attribute selectors — all of which the same
// criterion's OUT-OF-SCOPE list explicitly preserves — so it can never reach
// zero no matter how correct the rename is. Reconciling the clause by eye is
// exactly the kind of claim that rots: the number in the task note would be an
// assertion nobody could re-check.
//
// So the criterion's own parenthetical is implemented literally, with the
// TypeScript compiler's parser rather than a regex:
//
//   node scripts/prose-scan.mjs [--term <regex>] [--root <dir> ...] [--all] [--json]
//
// Every .ts/.tsx file under the roots is parsed to an AST and only AUTHORED
// PROSE NODES are searched — string literals, every span of a template literal,
// and JSX text (the button label `Cantina` in `App.tsx` is JSX text, not a
// string literal, so a scan that skipped it would miss real player-facing copy).
// Comments are trivia and are never visited, which is the whole point: a comment
// naming the old system is out of scope by the task's own text.
//
// ONE MECHANICAL SPLIT, stated so it can be argued with. A matching literal is
// reported as PROSE if it contains whitespace, and as an IDENTIFIER-SHAPED TAG
// if it does not. That single rule — no allow-list, no per-file exception —
// separates `'This port keeps a Cantina — open it…'` from `'hangout-close'`,
// `'HangoutEvent'`, `'VisitHangout'` and `'./portHangouts.js'`, which are
// `data-testid`s, discriminated-union tags, the save literal and module
// specifiers respectively: every one of them explicitly OUT OF SCOPE, and none
// of them a thing a player can read. A hardcoded list of known-good hits was
// rejected precisely because it would go stale silently; a rule stays honest.
//
// THE RULE'S ONE KNOWN BLIND SPOT, named rather than discovered: a ONE-WORD
// player-facing label has no internal whitespace and is therefore filed under
// `identifier`. The launcher button in `App.tsx` — JSX text reading exactly
// `Cantina` — is the live example, and `--term cantina --all` shows it sitting
// in the identifier bucket. So the prose bucket is a LOWER BOUND on player-facing
// copy, not a complete census; `--all` is the honest read for a rename audit, and
// the reason it exists.
//
// Exit 0 always — this REPORTS, it does not gate. Which of the remaining prose
// hits are player-facing is still a human call (test titles and developer-facing
// validation messages are not), and encoding that judgment as a CI failure would
// smuggle the allow-list back in through the exit code.
// ---------------------------------------------------------------------------

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The surfaces T-204's Accept clause names. Override with `--root`. */
const DEFAULT_ROOTS = ['packages/ui/src', 'packages/desktop', 'packages/content/src'];

/** Directories that are never authored sources. */
const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', 'dist-web', 'dist-demo', 'release']);

const SOURCE_EXTENSIONS = ['.ts', '.tsx'];

function parseArgs(argv) {
  const roots = [];
  let term = 'hangout';
  let json = false;
  let all = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--root') {
      i += 1;
      roots.push(argv[i]);
    } else if (arg === '--term') {
      i += 1;
      term = argv[i];
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--all') {
      all = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return { roots: roots.length > 0 ? roots : DEFAULT_ROOTS, term, json, all };
}

function* walk(directory) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      yield* walk(full);
    } else if (SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
      yield full;
    }
  }
}

/**
 * Every AST node that holds text a human authored as PROSE — as opposed to an
 * identifier, a type name or a comment.
 *
 * `TemplateHead`/`TemplateMiddle`/`TemplateTail` are listed individually rather
 * than matching `TemplateExpression` as a whole so an interpolated expression
 * (`${systemName(id)}`) is never mistaken for prose.
 */
const PROSE_KINDS = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.JsxText,
]);

function scanFile(file, pattern) {
  const text = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const hits = [];
  const visit = (node) => {
    if (PROSE_KINDS.has(node.kind)) {
      const value = node.text;
      if (value !== undefined && pattern.test(value)) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        const collapsed = value.trim().replace(/\s+/g, ' ');
        hits.push({
          file: relative(REPO_ROOT, file),
          line: line + 1,
          kind: ts.SyntaxKind[node.kind],
          // The one mechanical split — see the header. Whitespace INSIDE the
          // authored literal (not the trimmed edges) is what makes it prose.
          shape: /\s/.test(value.trim()) ? 'prose' : 'identifier',
          text: collapsed,
        });
      }
      // A JSX element's children are visited normally; literals have none.
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return hits;
}

function main() {
  const { roots, term, json, all } = parseArgs(process.argv.slice(2));
  const pattern = new RegExp(term, 'i');
  const hits = [];
  let filesScanned = 0;
  for (const root of roots) {
    const absolute = resolve(REPO_ROOT, root);
    let stats;
    try {
      stats = statSync(absolute);
    } catch {
      throw new Error(`root does not exist: ${root}`);
    }
    const files = stats.isDirectory() ? walk(absolute) : [absolute];
    for (const file of files) {
      filesScanned += 1;
      hits.push(...scanFile(file, pattern));
    }
  }

  const prose = hits.filter((hit) => hit.shape === 'prose');
  const identifiers = hits.filter((hit) => hit.shape === 'identifier');

  if (json) {
    process.stdout.write(`${JSON.stringify({ term, roots, filesScanned, hits }, null, 2)}\n`);
    return;
  }

  process.stdout.write(`prose-scan · /${term}/i · ${roots.join(' ')} · ${filesScanned} files\n`);
  for (const hit of all ? hits : prose) {
    process.stdout.write(`${hit.file}:${hit.line} · ${hit.shape} · ${hit.kind} · ${hit.text}\n`);
  }
  process.stdout.write(
    `${prose.length} authored prose hit(s); ` +
      `${identifiers.length} identifier-shaped tag(s) not shown (--all to list)\n`,
  );
}

main();
