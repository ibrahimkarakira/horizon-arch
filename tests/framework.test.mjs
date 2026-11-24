import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSources } from '../scripts/check-sources.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (...parts) => readFile(join(root, ...parts), 'utf8');
const PAGE = ['src', 'content', 'docs', 'framework', 'model-half-life.mdx'];
const LAYERS = ['Model', 'Instructions and prompts', 'Tool and API interface', 'Data and memory', 'Evaluation assets', 'Human process'];

test('model-half-life page is published, cites at least 5 sources and passes the citation check', async () => {
  const page = await read(...PAGE);
  assert.doesNotMatch(page, /^draft:\s*true/m);
  assert.deepEqual(checkSources(page, 'model-half-life.mdx'), []);
  const definitions = page.match(/^\[\^[^\]]+\]:/gm) ?? [];
  assert.ok(definitions.length >= 5, `${definitions.length} footnote definitions`);
});

test('model-half-life page has the definition, a synthetic worked example, the estimation method and "What this is not"', async () => {
  const page = await read(...PAGE);
  for (const heading of [/^## Definition$/m, /^## The six layers$/m, /^## How to estimate it$/m, /^## Worked example \(synthetic\)$/m, /^## What this is not$/m]) {
    assert.match(page, heading);
  }
  for (const layer of LAYERS) assert.ok(page.includes(layer), layer);
});

test('layers.svg has the change-driver and measurement columns and no numbers in its text', async () => {
  const svg = await read('diagrams', 'layers.svg');
  const texts = [...svg.matchAll(/<(text|title|desc)\b[^>]*>([^<]*)</g)].map((m) => m[2]);
  for (const head of ['Layer', 'Typical change driver', 'How to measure', 'Half-life']) assert.ok(texts.includes(head), head);
  for (const layer of LAYERS) assert.ok(texts.includes(layer), layer);
  // Measured half-lives arrive with the lifetimes dataset; until then the diagram carries no figures.
  for (const text of texts) assert.doesNotMatch(text, /\d/, text);
});

// Reads the built site, so `npm run build` must run first (scripts/check.mjs does that).
test('built model-half-life page inlines the layers diagram and renders footnotes', async () => {
  const html = await read('dist', 'framework', 'model-half-life', 'index.html');
  assert.match(html, /<figure[^>]*>\s*<svg[^>]*role="img"/);
  assert.match(html, /<section[^>]*class="footnotes"/);
});
