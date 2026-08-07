import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const THEME = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'theme.css'),
  'utf8',
);

describe('T-216 · one phosphor color law', () => {
  it('defines the tokens the honor board uses instead of falling back to teal/blue', () => {
    expect(THEME).toMatch(/--accent:\s*var\(--ember-hi\);/);
    expect(THEME).toMatch(/--line:\s*var\(--hair\);/);
    expect(THEME).not.toContain('#4fd1c5');
    expect(THEME).not.toContain('#2b3a44');
  });

  it('renders hostile standing as reverse video rather than a second hue', () => {
    expect(THEME).not.toContain('#e0562a');
    expect(THEME).toMatch(/\.as-hostile \.as-value\s*\{[^}]*background:\s*var\(--ember\);/s);
    expect(THEME).toMatch(/\.as-hostile \.as-value\s*\{[^}]*color:\s*var\(--tube\);/s);
  });
});
