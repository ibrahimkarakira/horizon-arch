// 2100 structural predictions (issue #32): `kind: structural`, `proxy`, `conditional_on` and the method page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';
import { predictionSchema } from '../schema/prediction.schema.mjs';
import { checkSources } from '../scripts/check-sources.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (...parts) => readFile(join(root, ...parts), 'utf8');
const base2100 = parse(await read('tests', 'fixtures', 'valid', 'P2100-001.yml'));
const base2030 = parse(await read('tests', 'fixtures', 'valid', 'P2030-001.yml'));

const issuePaths = (data) => {
  const result = predictionSchema.safeParse(data);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
};

test('schema: a 2100 prediction must be kind structural', () => {
  const { kind, ...rest } = base2100;
  assert.ok(issuePaths(rest).includes('kind'));
  assert.ok(issuePaths({ ...base2100, kind: 'forecast' }).includes('kind'));
});

test('schema: kind structural requires a proxy', () => {
  const { proxy, ...rest } = base2100;
  assert.ok(issuePaths(rest).includes('proxy'));
});

test('schema: conditional_on is allowed only for kind structural', () => {
  assert.ok(issuePaths({ ...base2030, conditional_on: ['P2100-001'] }).includes('conditional_on'));
  assert.deepEqual(issuePaths({ ...base2100, id: 'P2100-002', conditional_on: ['P2100-001'] }), []);
});

const validate = (dir) => {
  const script = join(root, 'scripts', 'validate-predictions.mjs');
  const { status, stdout, stderr } = spawnSync(process.execPath, [script, dir], { cwd: root, encoding: 'utf8' });
  return { status, output: stdout + stderr };
};

// Writes one structural prediction per entry of `graph` (id -> conditional_on ids) into a temp dir.
async function writeGraph(graph) {
  const dir = await mkdtemp(join(tmpdir(), 'horizon-structural-'));
  for (const [id, conditionalOn] of Object.entries(graph)) {
    const data = { ...base2100, id, ...(conditionalOn.length ? { conditional_on: conditionalOn } : {}) };
    await writeFile(join(dir, `${id}.yml`), stringify(data));
  }
  return dir;
}

test('validator accepts a conditional chain of existing ids', async () => {
  const { status, output } = validate(await writeGraph({ 'P2100-001': [], 'P2100-002': ['P2100-001'], 'P2100-003': ['P2100-001', 'P2100-002'] }));
  assert.equal(status, 0, output);
  assert.match(output, /3 predictions, 0 errors/);
});

test('validator rejects conditional_on naming an id that does not exist', async () => {
  const { status, output } = validate(await writeGraph({ 'P2100-001': [], 'P2100-002': ['P2100-009'] }));
  assert.equal(status, 1, output);
  assert.match(output, /P2100-002\.yml:\d+: error: conditional_on\.0: unknown prediction id P2100-009/);
});

test('validator accepts one file whose conditional_on ids sit next to it', async () => {
  const dir = await writeGraph({ 'P2100-001': [], 'P2100-002': ['P2100-001'] });
  const { status, output } = validate(join(dir, 'P2100-002.yml'));
  assert.equal(status, 0, output);
  assert.match(output, /1 predictions, 0 errors/);
});

test('validator rejects a conditional_on cycle and names it', async () => {
  const { status, output } = validate(await writeGraph({ 'P2100-001': ['P2100-003'], 'P2100-002': ['P2100-001'], 'P2100-003': ['P2100-002'] }));
  assert.equal(status, 1, output);
  assert.match(output, /error: conditional_on: cycle P2100-001 -> P2100-003 -> P2100-002 -> P2100-001/);
});

test('validator rejects a prediction conditional on itself', async () => {
  const { status, output } = validate(await writeGraph({ 'P2100-001': ['P2100-001'] }));
  assert.equal(status, 1, output);
  assert.match(output, /error: conditional_on: cycle P2100-001 -> P2100-001/);
});

test('published 2100 predictions: three, structural, each with a proxy, a probability and a near-term checkpoint', async () => {
  const files = (await readdir(join(root, 'predictions'))).filter((f) => f.startsWith('P2100-'));
  assert.deepEqual(files.sort(), ['P2100-001.yml', 'P2100-002.yml', 'P2100-003.yml']);
  for (const file of files) {
    const p = parse(await read('predictions', file));
    assert.deepEqual(issuePaths(p), [], file);
    assert.equal(p.kind, 'structural', file);
    assert.equal(p.resolution_date, '2100-12-31', file);
    assert.ok(p.proxy && Number.isInteger(p.probability), file);
  }
});

test('2100 method page is published, passes the citation check and says no one will see these resolve', async () => {
  const page = await read('src', 'content', 'docs', 'scenarios', '2100.mdx');
  assert.doesNotMatch(page, /^draft:\s*true/m);
  assert.deepEqual(checkSources(page, '2100.mdx'), []);
  assert.ok((page.match(/^\[\^[^\]]+\]:/gm) ?? []).length >= 2);
  assert.match(page, /no one .* will see .* resolve/i);
  for (const id of ['P2100-001', 'P2100-002', 'P2100-003']) assert.ok(page.includes(id), id);
});

test('2100 method page table and median match the prediction files', async () => {
  const page = await read('src', 'content', 'docs', 'scenarios', '2100.mdx');
  for (const id of ['P2100-001', 'P2100-002', 'P2100-003']) {
    const p = parse(await read('predictions', `${id}.yml`));
    const row = page.split('\n').find((line) => line.startsWith(`| ${id} |`));
    assert.ok(row, `${id}: no table row`);
    const [, , conditionalOn, probability] = row.split('|').slice(1, -1).map((cell) => cell.trim());
    assert.equal(probability, String(p.probability), `${id}: probability`);
    assert.equal(conditionalOn, (p.conditional_on ?? []).join(', ') || 'none', `${id}: conditional_on`);
  }
  const basis = parse(await read('predictions', 'P2100-001.yml')).probability_basis;
  const [, median, n] = basis.match(/([\d.]+) days\s+\(n = (\d+)/);
  assert.match(page, new RegExp(`over ${n} model versions is ${median.replace('.', '\\.')} days`));
});
