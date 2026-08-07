import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const PROCESS_GUARD_TASK_NUMBER = 229;
const KNOWN_INTERIM_MARKERS = new Set([
  'docs/PLAYTEST-TELEMETRY_SPEC.md:13',
  'packages/desktop/e2e/shell.spec.ts:650',
  'packages/ui/e2e/playtest-logging.spec.ts:45',
  'packages/ui/src/__tests__/playtest-log.test.ts:65',
  'packages/ui/src/__tests__/playtest-log.test.ts:66',
  'packages/ui/src/__tests__/playtest-log.test.ts:67',
  'packages/ui/src/playtestLog.ts:8',
  'packages/ui/src/playtestLog.ts:157',
  'packages/ui/src/store.ts:491',
  'packages/ui/src/store.ts:492',
]);

interface TaskHeader {
  readonly id: string;
  readonly title: string;
  readonly line: number;
  readonly status: string;
  readonly after: readonly string[];
  readonly halts: boolean;
  readonly body: string;
}

function readRepo(path: string): string {
  return readFileSync(join(REPO_ROOT, path), 'utf8');
}

function taskHeaders(markdown = readRepo('TASKS.md')): TaskHeader[] {
  const lines = markdown.split(/\r?\n/);
  const headers: Omit<TaskHeader, 'body'>[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = /^### (T-\d+[a-z]?) · (.*?) — `status: ([^`]+)`.*?`after: ([^`]+)`/.exec(line);
    if (match === null) continue;
    headers.push({
      id: match[1],
      title: match[2],
      line: index + 1,
      status: match[3],
      after:
        match[4] === '—'
          ? []
          : match[4]
              .split(',')
              .map((part) => part.trim())
              .filter(Boolean),
      halts: /\[BLOCKED BY =|status: BLOCKED|HALTS/i.test(line),
    });
  }
  return headers.map((header, index) => {
    const start = header.line;
    const end = headers[index + 1]?.line ?? lines.length + 1;
    return { ...header, body: lines.slice(start, end - 1).join('\n') };
  });
}

function transitiveAfter(task: TaskHeader, byId: Map<string, TaskHeader>): Set<string> {
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const parent of byId.get(id)?.after ?? []) visit(parent);
  };
  for (const id of task.after) visit(id);
  return seen;
}

function deliveredBlocks(): TaskHeader[] {
  return taskHeaders().filter(
    (task) => task.status === 'DONE' && /^\*\*Delivered/im.test(task.body),
  );
}

function taskNumber(id: string): number {
  const match = /^T-(\d+)/.exec(id);
  if (match === null) throw new Error(`Unparseable task id ${id}`);
  return Number(match[1]);
}

function processGuardedTasks(): TaskHeader[] {
  return taskHeaders().filter((task) => taskNumber(task.id) >= PROCESS_GUARD_TASK_NUMBER);
}

function deliveredText(task: TaskHeader): string {
  const index = task.body.search(/^\*\*Delivered/im);
  return index < 0 ? '' : task.body.slice(index);
}

function acceptOrDeliveredText(): string {
  return processGuardedTasks()
    .map((task) =>
      task.body
        .split(/\n(?=### T-\d+)/)[0]
        .split(/\n(?=\*\*Delivered|\*\*Accept:)/)
        .filter((section) => /^\*\*(Delivered|Accept:)/i.test(section))
        .join('\n'),
    )
    .join('\n');
}

function walk(
  dir: string,
  ignored = new Set(['.git', 'node_modules', 'dist', 'release']),
): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (ignored.has(entry)) continue;
    const absolute = join(dir, entry);
    const stat = statSync(absolute);
    if (stat.isDirectory()) files.push(...walk(absolute, ignored));
    else files.push(absolute);
  }
  return files;
}

function exportedSymbols(): Set<string> {
  const symbols = new Set<string>();
  const pattern =
    /export\s+(?:declare\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
  for (const file of walk(join(REPO_ROOT, 'packages')).filter((path) => /\.tsx?$/.test(path))) {
    const source = readFileSync(file, 'utf8');
    let match = pattern.exec(source);
    while (match !== null) {
      symbols.add(match[1]);
      match = pattern.exec(source);
    }
  }
  return symbols;
}

function repoFiles(): string[] {
  return walk(REPO_ROOT);
}

function resolvesPathToken(token: string, files: readonly string[]): boolean {
  const withoutLine = token.replace(/:\d+(?:-\d+)?$/, '');
  if (existsSync(join(REPO_ROOT, withoutLine))) return true;
  if (!withoutLine.includes('/')) {
    return files.some((file) => basename(file) === withoutLine);
  }
  return false;
}

function currentSaveVersion(): number {
  const match = /export const CURRENT_SAVE_VERSION = (\d+);/.exec(
    readRepo('packages/engine/src/save.ts'),
  );
  if (match === null) throw new Error('CURRENT_SAVE_VERSION declaration did not resolve');
  return Number(match[1]);
}

function lineAt(path: string, lineNumber: number): string | null {
  const absolute = join(REPO_ROOT, path);
  if (!existsSync(absolute)) return null;
  const lines = readFileSync(absolute, 'utf8').split(/\r?\n/);
  return lines[lineNumber - 1] ?? null;
}

describe('M8 · TASKS.md process checks', () => {
  it('T-229 · TODO order follows `after:` and does not sit behind unrelated halts', () => {
    const tasks = processGuardedTasks();
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const problems: string[] = [];

    for (const task of tasks.filter((item) => item.status === 'TODO')) {
      const dependencies = transitiveAfter(task, byId);
      for (const dependency of task.after) {
        const parent = byId.get(dependency);
        if (parent !== undefined && parent.line > task.line) {
          problems.push(`${task.id} appears before its dependency ${dependency}`);
        }
      }
      for (const halt of tasks.filter((item) => item.halts && item.line < task.line)) {
        if (!dependencies.has(halt.id) && task.status === 'TODO') {
          problems.push(`${task.id} sits below halting task ${halt.id} without depending on it`);
        }
      }
    }

    expect(problems).toEqual([]);
  });

  it('T-230 · backticked paths and exported symbols in Delivered notes resolve', () => {
    const exports = exportedSymbols();
    const files = repoFiles();
    const problems: string[] = [];
    const ignored = new Set([
      'DONE',
      'TODO',
      'IN-PROGRESS',
      'BLOCKED',
      'auto',
      'bottom',
      'clientWidth',
      'rulesFingerprint',
      'top',
    ]);

    for (const task of deliveredBlocks().filter(
      (item) => taskNumber(item.id) >= PROCESS_GUARD_TASK_NUMBER,
    )) {
      for (const token of deliveredText(task).match(/`([^`\n]+)`/g) ?? []) {
        const value = token.slice(1, -1);
        if (value.includes(' ')) continue;
        if (
          /[/.]/.test(value) &&
          /\.(?:ts|tsx|md|json|mjs|js|png|webm|zip|html)(?::\d+)?$/.test(value)
        ) {
          if (!resolvesPathToken(value, files))
            problems.push(`${task.id}: ${value} does not exist`);
        } else if (
          /^[A-Za-z_$][\w$]*$/.test(value) &&
          !ignored.has(value) &&
          (/^[A-Z][\w$]*$/.test(value) || /Brain$/.test(value))
        ) {
          if (!exports.has(value))
            problems.push(`${task.id}: exported symbol ${value} does not resolve`);
        }
      }
    }

    expect(problems).toEqual([]);
  });

  it('T-239 · doc-to-source line pins point at existing files and lines', () => {
    const problems: string[] = [];
    const pin =
      /`?((?:packages|docs|scripts)\/[\w./-]+\.(?:ts|tsx|md|json|mjs|js)):(\d+)(?:-(\d+))?`?/g;
    for (const file of walk(join(REPO_ROOT, 'docs')).filter((path) => path.endsWith('.md'))) {
      if (/(?:^|\/)(?:0\.5\.2|N-SERIES).*REVIEW.*\.md$/.test(relative(REPO_ROOT, file))) {
        continue;
      }
      const text = readFileSync(file, 'utf8');
      if (/SQ-PIN-FROZEN/.test(text)) continue;
      let match = pin.exec(text);
      while (match !== null) {
        const start = Number(match[2]);
        const end = Number(match[3] ?? match[2]);
        const lines = readRepo(match[1]).split(/\r?\n/);
        if (start < 1 || end > lines.length) {
          problems.push(
            `${relative(REPO_ROOT, file)} cites ${match[1]}:${start}-${end}, outside file`,
          );
        }
        match = pin.exec(text);
      }
    }
    expect(problems).toEqual([]);
  });

  it('T-241 · Delivered save-version and owner-confirmation claims agree with the tree', () => {
    const tasks = deliveredBlocks().filter(
      (item) => taskNumber(item.id) >= PROCESS_GUARD_TASK_NUMBER,
    );
    const liveVersion = currentSaveVersion();
    const treeText = walk(REPO_ROOT)
      .filter((path) => /\.(?:ts|tsx|md)$/.test(path))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    const problems: string[] = [];

    for (const task of tasks) {
      const delivered = deliveredText(task);
      if (/owner confirm|confirmed with the owner|owner confirmation/i.test(delivered)) {
        const marker = new RegExp(
          `PROPOSED\\s+—\\s+AWAITING OWNER CONFIRMATION[\\s\\S]{0,160}${task.id}`,
          'i',
        );
        if (marker.test(treeText)) {
          problems.push(
            `${task.id}: Delivered claims owner confirmation but a PROPOSED marker remains`,
          );
        }
      }
      const claim = /CURRENT_SAVE_VERSION`?\s*(\d+)\s*(?:→|->)\s*(\d+)/.exec(delivered);
      if (claim !== null && Number(claim[2]) !== liveVersion) {
        problems.push(`${task.id}: save-version claim ends at ${claim[2]}, live is ${liveVersion}`);
      }
    }

    expect(problems).toEqual([]);
  });

  it('T-263 · artefact paths in Delivered/Accept notes resolve on disk', () => {
    const text = acceptOrDeliveredText();
    const artefact =
      /`([^`\n]*(?:test-results|screenshots|playwright-report|\.png|\.json|\.log|\.webm)[^`\n]*)`/g;
    const problems: string[] = [];
    let match = artefact.exec(text);
    while (match !== null) {
      const raw = match[1].replace(/:\d+(?:-\d+)?$/, '');
      if (/[*]/.test(raw) || /^https?:/.test(raw)) {
        match = artefact.exec(text);
        continue;
      }
      const candidates = [join(REPO_ROOT, raw), join(REPO_ROOT, 'packages/ui', raw)];
      if (!candidates.some(existsSync)) problems.push(`${raw} does not resolve`);
      match = artefact.exec(text);
    }
    expect(problems).toEqual([]);
  });

  it('T-264 · interim deviation markers are closed or have an open restore entry', () => {
    const markers = /INTERIM DEVIATION|pre-public|revert before public/i;
    const openRestore =
      /(status: TODO|status: IN-PROGRESS)[\s\S]{0,240}(restore|revert|deviation)/i;
    const taskText =
      readRepo('TASKS.md') + (existsSync(join(REPO_ROOT, 'TODO.md')) ? readRepo('TODO.md') : '');
    const problems: string[] = [];

    for (const file of walk(REPO_ROOT).filter((path) => /\.(?:ts|tsx|md)$/.test(path))) {
      const repoPath = relative(REPO_ROOT, file);
      if (
        repoPath === 'TASKS.md' ||
        repoPath === 'packages/sim/src/__tests__/task-process.test.ts'
      ) {
        continue;
      }
      const text = readFileSync(file, 'utf8');
      if (!markers.test(text)) continue;
      const lines = text.split(/\r?\n/);
      lines.forEach((line, index) => {
        if (!markers.test(line)) return;
        const window = lines.slice(Math.max(0, index - 10), index + 11).join('\n');
        if (/CLOSED \(T-\d+[a-z]?, \d{4}-\d{2}-\d{2}\)/.test(window)) return;
        if (/PROVENANCE, T-\d+[a-z]?, \d{4}-\d{2}-\d{2}[\s\S]*closed/i.test(window)) return;
        if (openRestore.test(taskText)) return;
        const marker = `${repoPath}:${index + 1}`;
        if (KNOWN_INTERIM_MARKERS.has(marker)) return;
        problems.push(`${marker} has an untracked interim marker`);
      });
    }

    expect(problems).toEqual([]);
    expect(KNOWN_INTERIM_MARKERS.size).toBe(10);
  });

  it('documents the seeded regression fixtures these scanners cover', () => {
    const syntheticTasks = [
      '### T-158 · Halt — `status: TODO` · `coder: opus` · `after: —` · `[BLOCKED BY = Human UAT]`',
      '### T-154 · Build — `status: TODO` · `coder: opus` · `after: —`',
    ].join('\n\n');
    const tasks = taskHeaders(syntheticTasks);
    expect(tasks[1].line).toBeGreaterThan(tasks[0].line);
    expect(tasks[0].halts).toBe(true);
    expect(lineAt('packages/sim/src/index.ts', 999_999)).toBeNull();
  });
});
