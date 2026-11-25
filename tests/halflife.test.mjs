import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { checkRows, halfLife, parseCsv, report } from '../scripts/model-halflife.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const HEADER = 'vendor,model,released,deprecation_announced,retired,source_url,accessed,notes_source_url,notes_accessed';
const csv = (...lines) => [HEADER, ...lines].join('\n') + '\n';
const src = 'https://example.org/deprecations,2026-11-25,,';

test('the median of days from release to notice is computed over complete rows only', () => {
  const rows = parseCsv(csv(
    `A,m1,2025-01-01,2025-04-11,2025-07-01,${src}`, // 100 days
    `A,m2,2025-01-01,2025-07-20,,${src}`, // 200 days, no retirement date needed
    `B,m3,2024-01-01,2024-12-26,2025-03-01,${src}`, // 360 days
    `B,m4,,2025-02-01,2025-05-01,${src}`, // no release date
    `C,m5,2025-03-01,,2025-09-01,${src}`, // no notice date
  ));
  const result = halfLife(rows);
  assert.equal(result.n, 3);
  assert.equal(result.median, 200);
  assert.deepEqual(result.excluded, [
    { model: 'm4', reason: 'missing released' },
    { model: 'm5', reason: 'missing deprecation_announced' },
  ]);
});

test('an even n takes the mean of the two middle values', () => {
  const rows = parseCsv(csv(`A,m1,2025-01-01,2025-01-11,,${src}`, `A,m2,2025-01-01,2025-01-21,,${src}`));
  assert.equal(halfLife(rows).median, 15);
});

test('with no complete row the median is null and n is 0', () => {
  const result = halfLife(parseCsv(csv(`A,m1,,2025-01-11,2025-03-01,${src}`)));
  assert.equal(result.n, 0);
  assert.equal(result.median, null);
  assert.match(report(result), /^n=0 median_days=n\/a excluded=1$/m);
});

test('a notice dated before the release is excluded, not counted as negative', () => {
  const result = halfLife(parseCsv(csv(`A,m1,2025-05-01,2025-04-01,,${src}`)));
  assert.equal(result.n, 0);
  assert.deepEqual(result.excluded, [{ model: 'm1', reason: 'deprecation_announced before released' }]);
});

test('rows without a source URL or access date, or with an impossible date, fail the check', () => {
  const rows = parseCsv(csv(
    'A,m1,2025-01-01,2025-02-01,,,2026-11-25,,',
    'A,m2,2025-01-01,2025-02-01,,https://example.org,,,',
    'A,m3,2025-02-30,2025-03-01,,https://example.org,2026-11-25,,',
  ));
  assert.deepEqual(checkRows(rows), [
    'line 2 (m1): source_url must be an http(s) URL',
    'line 3 (m2): accessed must be a YYYY-MM-DD date',
    'line 4 (m3): released is not a real date: 2025-02-30',
  ]);
});

test('a date taken from release notes needs its own URL and access date', () => {
  const rows = parseCsv(csv(
    'A,m1,2025-01-01,2025-02-01,,https://example.org,2026-11-26,https://example.org/notes,2026-11-26',
    'A,m2,2025-01-01,2025-02-01,,https://example.org,2026-11-26,https://example.org/notes,',
    'A,m3,2025-01-01,2025-02-01,,https://example.org,2026-11-26,,2026-11-26',
    'A,m4,2025-01-01,2025-02-01,,https://example.org,2026-11-26,notes,2026-11-26',
    'A,m5,2025-01-01,2025-02-01,,https://example.org,2026-11-26,https://example.org/notes,2026-13-01',
  ));
  assert.deepEqual(checkRows(rows), [
    'line 3 (m2): notes_source_url and notes_accessed must be set together',
    'line 4 (m3): notes_source_url and notes_accessed must be set together',
    'line 5 (m4): notes_source_url must be an http(s) URL',
    'line 6 (m5): notes_accessed is not a real date: 2026-13-01',
  ]);
});

test('a date that is not YYYY-MM-DD is reported, not imputed or crashed on', () => {
  const rows = parseCsv(csv(
    'A,m1,2025,2025-02-01,,https://example.org,2026-11-26,,',
    'A,m2,2025-1-1,2025-02-01,,https://example.org,2026-11-26,,',
  ));
  assert.deepEqual(checkRows(rows), [
    'line 2 (m1): released is not a real date: 2025',
    'line 3 (m2): released is not a real date: 2025-1-1',
  ]);
});

test('a wrong header or a row with the wrong number of fields is rejected', () => {
  assert.throws(() => parseCsv('vendor,model\nA,m1\n'), /header must be/);
  assert.throws(() => parseCsv(csv('A,m1,2025-01-01')), /line 2: expected 9 fields, got 3/);
});

test('every row of the published dataset has a source URL and an access date', async () => {
  const rows = parseCsv(await readFile(`${root}data/model-lifetimes.csv`, 'utf8'));
  assert.ok(rows.length > 0);
  assert.deepEqual(checkRows(rows), []);
});

test('rerunning the script gives identical output', () => {
  const run = () => spawnSync(process.execPath, ['scripts/model-halflife.mjs'], { cwd: root, encoding: 'utf8' });
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /^n=\d+ median_days=\S+ excluded=\d+$/m);
  assert.equal(run().stdout, first.stdout);
});

test('the lifetimes page states the numbers the script computes from the CSV', async () => {
  const rows = parseCsv(await readFile(`${root}data/model-lifetimes.csv`, 'utf8'));
  const { n, median, excluded } = halfLife(rows);
  const count = (reason) => excluded.filter((e) => e.reason === reason).length;
  const vendors = [...new Set(rows.map((r) => r.vendor))];
  const byVendor = vendors.map((v) => {
    const vRows = rows.filter((r) => r.vendor === v);
    return { v, rows: vRows.length, ...halfLife(vRows) };
  });
  const google = byVendor.find((x) => x.v === 'Google');
  const expected = [
    `**n = ${n}. Median: ${median} days`,
    `The dataset holds ${rows.length} rows; ${excluded.length} are excluded, ${count('missing released')} for a missing release date and ${count('missing deprecation_announced')} for a missing notice date.`,
    ...byVendor.map((x) => `| ${x.v} | ${x.rows} | ${x.n} | ${x.median} |`),
    `only on the ${rows.filter((r) => r.notes_source_url).length} rows where release notes`,
    `**Small n.** ${n} model versions`,
    `Google contributes ${google.n} of the ${n}.`,
  ];
  const page = await readFile(`${root}src/content/docs/framework/model-lifetimes.mdx`, 'utf8');
  for (const s of expected) assert.ok(page.includes(s), `page must state "${s}"`);
  assert.equal(page.match(/^\| (?!Vendor|---)\S+ \| \d+ \| \d+ \| [\d.]+ \|$/gm).length, vendors.length, 'vendor table must list each vendor once');
});
