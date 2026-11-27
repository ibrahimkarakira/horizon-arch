import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { checkSources } from '../scripts/check-sources.mjs';
import { chartSvg, lifetimes, parseCsv, spread } from '../scripts/model-halflife.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const HEADER = 'vendor,model,released,deprecation_announced,retired,source_url,accessed,notes_source_url,notes_accessed';
const src = 'https://example.org/deprecations,2026-11-25,,';
const fixture = parseCsv([
  HEADER,
  `A,m1,2025-01-01,2025-04-11,,${src}`, // 100 days
  `A,m2,2025-01-01,2025-04-11,,${src}`, // 100 days, same dot as m1
  `B,m3,2024-01-01,2024-12-26,,${src}`, // 360 days
  `B,m4,,2025-02-01,,${src}`, // excluded
].join('\n'));
const ESSAY = 'src/content/docs/essays/002-observed-model-lifetimes.mdx';

test('spread gives min, quartiles (medians of the lower and upper halves), median and max', () => {
  assert.deepEqual(spread([1, 2, 3, 4, 5, 6, 7, 8]), { min: 1, q1: 2.5, median: 4.5, q3: 6.5, max: 8 });
  assert.deepEqual(spread([5, 1, 3, 2, 4]), { min: 1, q1: 1.5, median: 3, q3: 4.5, max: 5 });
  assert.equal(spread([]), null);
});

test('lifetimes keeps the CSV line of every included row', () => {
  const { included, excluded } = lifetimes(fixture);
  assert.deepEqual(included.map((x) => [x.line, x.model, x.days]), [[2, 'm1', 100], [3, 'm2', 100], [4, 'm3', 360]]);
  assert.deepEqual(excluded, [{ model: 'm4', reason: 'missing released' }]);
});

test('the chart has a title with n, axis labels, alt text and one dot per included row', () => {
  const svg = chartSvg(fixture);
  assert.match(svg, /<svg[^>]*role="img"[^>]*aria-labelledby="model-lifetimes-title model-lifetimes-desc"/);
  assert.match(svg, /<title id="model-lifetimes-title">[^<]*\(n = 3\)<\/title>/);
  assert.match(svg, /<desc id="model-lifetimes-desc">[^<]*A: n = 2, median 100 days[^<]*B: n = 1, median 360 days[^<]*<\/desc>/);
  assert.match(svg, />Days from release to deprecation notice</);
  assert.match(svg, />Vendor</);
  assert.equal(svg.match(/<circle\b/g).length, 3);
  const bare = svg.replace(/var\(--ha-[\w-]+, #[0-9a-f]{6}\)/gi, '').match(/#[0-9a-f]{3,6}\b/gi);
  assert.equal(bare, null, String(bare));
  assert.equal(chartSvg(fixture), svg, 'output is deterministic');
});

test('the committed chart is exactly what `model-halflife.mjs --svg` prints from the CSV', async () => {
  const run = spawnSync(process.execPath, ['scripts/model-halflife.mjs', '--svg'], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(await readFile(`${root}diagrams/model-lifetimes.svg`, 'utf8'), run.stdout);
});

test('essay 2 states the computed numbers with CSV line references and passes the citation check', async () => {
  const rows = parseCsv(await readFile(`${root}data/model-lifetimes.csv`, 'utf8'));
  const { included } = lifetimes(rows);
  const s = spread(included.map((x) => x.days));
  const ref = (x) => `${x.days} days (\`${x.model}\`, line ${x.line})`;
  const shortest = included.toSorted((a, b) => a.days - b.days || a.line - b.line)[0];
  const longest = included.toSorted((a, b) => b.days - a.days || a.line - b.line)[0];
  const preview = included.filter((x) => x.model.includes('preview'));
  const other = included.filter((x) => !x.model.includes('preview'));
  const vendors = [...new Set(rows.map((r) => r.vendor))];
  const expected = [
    `n = ${included.length}`,
    `median ${s.median} days`,
    `quartiles ${s.q1} and ${s.q3} days`,
    `Shortest: ${ref(shortest)}`,
    `Longest: ${ref(longest)}`,
    ...vendors.map((v) => {
      const x = spread(included.filter((y) => y.vendor === v).map((y) => y.days));
      return `| ${v} | ${included.filter((y) => y.vendor === v).length} | ${x.min} | ${x.q1} | ${x.median} | ${x.q3} | ${x.max} |`;
    }),
    ...vendors.map((v) => {
      const own = included.filter((y) => y.vendor === v);
      const lo = own.toSorted((a, b) => a.days - b.days || a.line - b.line)[0];
      const hi = own.toSorted((a, b) => b.days - a.days || a.line - b.line)[0];
      return `- ${v}: shortest ${ref(lo)}, longest ${ref(hi)}`;
    }),
    `Rows missing either date are left out, not estimated: ${rows.length - included.length} of the ${rows.length} rows.`,
    `Of the ${preview.length} preview IDs, ${preview.filter((x) => x.vendor === 'Google').length} are Google's and ${preview.filter((x) => x.vendor === 'Anthropic').length} is Anthropic's.`,
    `${included.length} versions, ${included.filter((x) => x.vendor === 'Google').length} of them Google's`,
    `the median of all ${included.length} (${s.median} days)`,
    `| ID contains \`preview\` | ${preview.length} | ${spread(preview.map((x) => x.days)).median} |`,
    `| Other IDs | ${other.length} | ${spread(other.map((x) => x.days)).median} |`,
    'node scripts/model-halflife.mjs --svg > diagrams/model-lifetimes.svg',
    "import ModelLifetimes from '../../../../diagrams/model-lifetimes.svg';",
  ];
  const page = await readFile(`${root}${ESSAY}`, 'utf8');
  for (const e of expected) assert.ok(page.includes(e), `essay must state "${e}"`);
  const limits = page.split(/^## What the data cannot say$/m)[1]?.split(/^## /m)[0] ?? '';
  assert.ok((limits.match(/^- \*\*/gm) ?? []).length >= 3, 'at least three limitations');
  // Prose is Ibrahim's, so the page stays a draft; the data sections must already pass once published.
  assert.deepEqual(checkSources(page.replace(/^draft: true\r?\n/m, ''), ESSAY), []);
});
