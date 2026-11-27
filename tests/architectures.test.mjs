import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSources } from '../scripts/check-sources.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (...parts) => readFile(join(root, ...parts), 'utf8');
const PAGE = ['src', 'content', 'docs', 'architectures', 'eval-gated-swap.mdx'];
const STEPS = ['Frozen eval set', 'Candidate run', 'Side-by-side diff', 'Decision record', 'Rollback'];

test('eval-gated-swap page is published, cites at least 3 sources and passes the citation check', async () => {
  const page = await read(...PAGE);
  assert.doesNotMatch(page, /^draft:\s*true/m);
  assert.deepEqual(checkSources(page, 'eval-gated-swap.mdx'), []);
  const definitions = page.match(/^\[\^[^\]]+\]:/gm) ?? [];
  assert.ok(definitions.length >= 3, `${definitions.length} footnote definitions`);
});

test('eval-gated-swap page maps every step to its output artefact and says what it does not prove', async () => {
  const page = await read(...PAGE);
  assert.match(page, /^## Steps and the evidence each one produces$/m);
  assert.match(page, /^\| Step \| What happens \| Output artefact \|$/m);
  for (const step of STEPS) assert.match(page, new RegExp(`^\\| ${step} \\| [^|]+ \\| [^|]*\\w[^|]* \\|$`, 'm'), step);
  assert.match(page, /^## What this does not prove$/m);
  assert.match(page, /^## Any eval tool fills the box$/m);
  // churnbench is not public yet: no link to it until it is, and then only as one example.
  assert.doesNotMatch(page, /churnbench/i);
});

test('eval-gated-swap.svg follows the convention: labelled, palette colours only, every step drawn', async () => {
  const svg = await read('diagrams', 'eval-gated-swap.svg');
  assert.match(svg, /<svg[^>]*role="img"/);
  assert.match(svg, /<svg[^>]*aria-labelledby="eval-gated-swap-title eval-gated-swap-desc"/);
  assert.match(svg, /<title id="eval-gated-swap-title">[^<]+<\/title>/);
  assert.match(svg, /<desc id="eval-gated-swap-desc">[^<]+<\/desc>/);
  const texts = [...svg.matchAll(/<text\b[^>]*>([^<]*)</g)].map((m) => m[1]);
  for (const step of STEPS) assert.ok(texts.includes(step), step);
  // Every colour is a palette variable with a fallback; no bare hex outside var(...).
  const bare = svg.replace(/var\(--ha-[\w-]+, #[0-9a-f]{6}\)/gi, '').match(/#[0-9a-f]{3,6}\b/gi);
  assert.equal(bare, null, String(bare));
});

// Reads the built site, so `npm run build` must run first (scripts/check.mjs does that).
test('built eval-gated-swap page inlines the labelled SVG with a caption and renders footnotes', async () => {
  const html = await read('dist', 'architectures', 'eval-gated-swap', 'index.html');
  assert.match(html, /<figure[^>]*>\s*<svg[^>]*role="img"/);
  assert.match(html, /<title id="eval-gated-swap-title">/);
  assert.match(html, /<figcaption>[^<]+/);
  assert.match(html, /<section[^>]*class="footnotes"/);
});
