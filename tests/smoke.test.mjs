import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Reads the built site, so `npm run build` must run first (scripts/check.mjs does that).
test('built home page carries the tagline', async () => {
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.match(html, /Design for the swap/);
});
