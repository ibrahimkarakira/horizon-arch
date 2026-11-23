import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { parse } from 'yaml';
import { predictionSchema, predictionJsonSchema } from '../schema/prediction.schema.mjs';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const validDir = 'tests/fixtures/valid/';

// Paths of every issue, as dotted strings ("assumptions", "sources.0.url").
const issuePaths = (data) => {
  const result = predictionSchema.safeParse(data);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
};

for (const file of await readdir(new URL(validDir, root))) {
  test(`valid fixture ${file} passes`, async () => {
    assert.deepEqual(issuePaths(parse(await read(validDir + file))), []);
  });
}

test('valid fixtures cover every horizon', async () => {
  const files = await readdir(new URL(validDir, root));
  const horizons = await Promise.all(files.map(async (f) => parse(await read(validDir + f)).horizon));
  assert.deepEqual(horizons.sort(), [2030, 2050, 2100]);
});

// Each case changes one thing in a valid fixture and names the field path it must report.
// Cases that also need a file for the D03 validator live in tests/fixtures/invalid/ instead (tested below), not here.
const base = parse(await read(`${validDir}P2030-001.yml`));
const invalidCases = [
  ['source without access date', { sources: [{ title: 'x', url: 'https://example.org' }] }, 'sources.0.accessed'],
  ['checkpoint equal to created', { checkpoint_date: '2026-11-20' }, 'checkpoint_date'],
  ['checkpoint after resolution_date', { resolution_date: '2027-12-31' }, 'checkpoint_date'],
  ['unknown horizon', { horizon: 2040 }, 'horizon'],
  ['resolved without resolution_note', { status: 'ambiguous', resolved_on: '2030-12-31' }, 'resolution_note'],
  ['missing resolution_source', { resolution_source: undefined }, 'resolution_source'],
  ['impossible date', { created: '2026-02-30' }, 'created'],
  ['unknown field', { probabilty: 40 }, ''],
];

for (const [name, change, path] of invalidCases) {
  test(`invalid: ${name} reports "${path}"`, () => {
    const paths = issuePaths({ ...base, ...change });
    assert.ok(paths.includes(path), `expected an issue at "${path}", got ${JSON.stringify(paths)}`);
  });
}

// Invalid fixture files (also used by the validator): line 2 is `# expect: <field path>`.
const invalidDir = 'tests/fixtures/invalid/';
for (const file of await readdir(new URL(invalidDir, root))) {
  test(`invalid fixture ${file} fails at its expected path`, async () => {
    const source = await read(invalidDir + file);
    const [header, expect] = source.split(/\r?\n/);
    assert.equal(header, '# TEST DATA, not a published prediction');
    const path = expect.match(/^# expect: (\S+)$/)?.[1];
    assert.ok(path, `${file}: line 2 must be "# expect: <field path>"`);
    const paths = issuePaths(parse(source));
    assert.ok(paths.includes(path), `expected an issue at "${path}", got ${JSON.stringify(paths)}`);
  });
}

test('checkpoint window is 5 years for the 2050 and 2100 horizons', async () => {
  const p2050 = parse(await read(`${validDir}P2050-001.yml`));
  assert.deepEqual(issuePaths({ ...p2050, checkpoint_date: '2031-11-20' }), []);
  assert.deepEqual(issuePaths({ ...p2050, checkpoint_date: '2031-11-21' }), ['checkpoint_date']);
});

test('template fails as shipped and validates once placeholders are filled', async () => {
  const template = await read('templates/prediction.yml');
  assert.notDeepEqual(issuePaths(parse(template)), []);
  const values = {
    ID: 'P2050-002', TITLE: 'Filled template', CLAIM: 'By 2050-12-31, X happens.', HORIZON: '2050',
    RESOLUTION_DATE: '2050-12-31', CREATED: '2026-11-24', PROBABILITY: '40', PROBABILITY_BASIS: 'Base rate.',
    ASSUMPTION_1: 'A holds.', WATCH_1: 'Where A is published.', ASSUMPTION_2: 'B holds.', WATCH_2: 'Where B is published.',
    CHECKPOINT_DATE: '2030-06-30', CHECKPOINT_SIGNAL: 'X is under way.', RESOLUTION_CRITERIA: 'Source S shows X.',
    RESOLUTION_SOURCE: 'https://example.org/s', SOURCE_TITLE: 'S', SOURCE_URL: 'https://example.org/s',
    SOURCE_ACCESSED: '2026-11-24',
  };
  const filled = template.replace(/<([A-Z_0-9]+)>/g, (_, key) => {
    assert.ok(key in values, `no test value for placeholder <${key}>`);
    return values[key];
  });
  assert.deepEqual(issuePaths(parse(filled)), []);
});

test('committed JSON Schema matches the zod schema (run npm run schema:json)', async () => {
  assert.deepEqual(JSON.parse(await read('schema/prediction.schema.json')), predictionJsonSchema());
});
