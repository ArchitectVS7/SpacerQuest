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

describe('T-218 · one phosphor, two materials', () => {
  it('keeps steel material tokens additive beside the amber phosphor tokens', () => {
    for (const token of [
      '--steel-0',
      '--steel-1',
      '--steel-2',
      '--steel-3',
      '--steel-4',
      '--well',
      '--frame',
    ]) {
      expect(THEME).toContain(`${token}:`);
    }
    expect(THEME).toMatch(/--ember:\s*#ffb000;/);
    expect(THEME).toMatch(/--ember-hi:\s*#ffe1a6;/);
    expect(THEME).toMatch(/--amber:\s*#c0781a;/);
    expect(THEME).toMatch(/--amber-dim:\s*#5e3b0e;/);
    expect(THEME).toMatch(/--hair:\s*#3a2408;/);
  });

  it('renders ready slots and selected dice as lit outlines, not reverse video fills', () => {
    expect(THEME).toMatch(/\.slot\.ready\s*\{[^}]*background:\s*var\(--well\);/s);
    expect(THEME).toMatch(/\.slot\.ready\s*\{[^}]*color:\s*var\(--ember\);/s);
    expect(THEME).toMatch(/\.die\.sel\s*\{[^}]*color:\s*var\(--ember\);/s);
    expect(THEME).toMatch(/\.die\.sel\s*\{[^}]*inset 0 0 0 2px rgba\(255,\s*176,\s*0,\s*0\.58\)/s);
  });
});
