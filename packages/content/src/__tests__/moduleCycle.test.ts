import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const absolute = join(dir, entry);
    if (entry === '__tests__' || entry === 'dist') continue;
    if (statSync(absolute).isDirectory()) files.push(...walk(absolute));
    else if (absolute.endsWith('.ts')) files.push(absolute);
  }
  return files;
}

function stripTypeOnlyImports(source: string): string {
  return source
    .replace(/import\s+type\s+[\s\S]*?from\s+['"][^'"]+['"];?/g, '')
    .replace(/import\s*\{[^}]*\btype\b[^}]*\}\s*from\s*['"][^'"]+['"];?/g, (match) => {
      const runtimeNames = match
        .replace(/^[\s\S]*?\{/, '')
        .replace(/\}[\s\S]*$/, '')
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0 && !part.startsWith('type '));
      return runtimeNames.length === 0 ? '' : match;
    });
}

function runtimeRelativeImports(file: string): string[] {
  const source = stripTypeOnlyImports(readFileSync(file, 'utf8'));
  const imports: string[] = [];
  const pattern = /import\s+(?:[\s\S]*?\s+from\s+)?['"](\.[^'"]+)['"]/g;
  let match = pattern.exec(source);
  while (match !== null) {
    const specifier = match[1];
    if (specifier.endsWith('.js')) {
      imports.push(resolve(dirname(file), specifier.replace(/\.js$/, '.ts')));
    }
    match = pattern.exec(source);
  }
  return imports;
}

function moduleGraph(): Map<string, string[]> {
  const files = new Set(walk(SRC_ROOT));
  const graph = new Map<string, string[]>();
  for (const file of files) {
    graph.set(
      file,
      runtimeRelativeImports(file).filter((target) => files.has(target)),
    );
  }
  return graph;
}

function findCycle(graph: Map<string, string[]>): string[] | null {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  function visit(file: string): string[] | null {
    if (visiting.has(file)) {
      return stack.slice(stack.indexOf(file)).concat(file);
    }
    if (visited.has(file)) return null;
    visiting.add(file);
    stack.push(file);
    for (const target of graph.get(file) ?? []) {
      const cycle = visit(target);
      if (cycle !== null) return cycle;
    }
    stack.pop();
    visiting.delete(file);
    visited.add(file);
    return null;
  }

  for (const file of graph.keys()) {
    const cycle = visit(file);
    if (cycle !== null) return cycle;
  }
  return null;
}

describe('T-242 · content runtime imports stay acyclic', () => {
  it('castValidation.ts does not runtime-import liarsDiceValidation.ts', () => {
    const castValidation = join(SRC_ROOT, 'castValidation.ts');
    const imports = runtimeRelativeImports(castValidation).map((file) => relative(SRC_ROOT, file));
    expect(
      imports,
      'castValidation.ts may use type-only imports, but a runtime import of ' +
        'liarsDiceValidation.ts closes cast.ts -> castValidation.ts -> liarsDiceValidation.ts -> cast.ts.',
    ).not.toContain('liarsDiceValidation.ts');
  });

  it('packages/content/src has no module-level runtime import cycle', () => {
    const cycle = findCycle(moduleGraph());
    expect(
      cycle?.map((file) => relative(SRC_ROOT, file)).join(' -> ') ?? null,
      'Runtime cycles in content create import-order/TDZ hazards. Type-only imports are permitted.',
    ).toBeNull();
  });
});
