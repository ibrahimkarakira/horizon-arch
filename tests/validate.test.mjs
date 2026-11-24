import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const script = join(root, 'scripts', 'validate-predictions.mjs');
const validDir = join(root, 'tests', 'fixtures', 'valid');
const invalidDir = join(root, 'tests', 'fixtures', 'invalid');

const validate = (...args) => {
  const { status, stdout, stderr } = spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8' });
  return { status, output: stdout + stderr };
};

const tempDir = () => mkdtemp(join(tmpdir(), 'horizon-validate-'));

test('valid fixtures exit 0', () => {
  const { status, output } = validate(validDir);
  assert.equal(status, 0, output);
  assert.match(output, /3 predictions, 0 errors, 0 warnings/);
});

// Line 2 of each invalid fixture is `# expect: <field path>: <reason text>`. The reason is asserted too:
// fixture filenames never match their ids, so every fixture also gets an `id: ... must match the filename`
// error, which alone would satisfy a field-only or exit-code-only check.
for (const file of await readdir(invalidDir)) {
  test(`invalid fixture ${file} exits 1 and names file, field and reason`, async () => {
    const [, field, reason] = (await readFile(join(invalidDir, file), 'utf8')).split(/\r?\n/)[1].match(/^# expect: (\S+): (.+)$/);
    const { status, output } = validate(join(invalidDir, file));
    assert.equal(status, 1, output);
    const line = output.split('\n').find((l) => l.includes(`error: ${field}: `) && l.includes(reason));
    assert.ok(line, `no error for field "${field}" with reason "${reason}" in:\n${output}`);
    assert.match(line, new RegExp(`${file.replace('.', '\\.')}:\\d+: error: ${field.replace('.', '\\.')}: \\S`));
  });
}

test('error line numbers point at the offending field', () => {
  // probability-100.yml: line 2 is the expect comment, `probability: 100` sits on line 10.
  const { output } = validate(join(invalidDir, 'probability-100.yml'));
  assert.match(output, /probability-100\.yml:10: error: probability: /);
});

test('id that does not match its filename is an error', async () => {
  const dir = await tempDir();
  await writeFile(join(dir, 'P2030-002.yml'), await readFile(join(validDir, 'P2030-001.yml')));
  const { status, output } = validate(dir);
  assert.equal(status, 1, output);
  assert.match(output, /P2030-002\.yml:2: error: id: id P2030-001 must match the filename P2030-002/);
});

test('duplicate ids across files are detected', async () => {
  const dir = await tempDir();
  await writeFile(join(dir, 'P2030-001.yml'), await readFile(join(validDir, 'P2030-001.yml')));
  const { status, output } = validate(validDir, dir);
  assert.equal(status, 1, output);
  assert.match(output, /error: id: duplicate id P2030-001, also in .*P2030-001\.yml/);
});

test('a vague word in the claim is a warning, not an error', async () => {
  const dir = await tempDir();
  const source = await readFile(join(validDir, 'P2030-001.yml'), 'utf8');
  await writeFile(join(dir, 'P2030-001.yml'), source.replace('reaches at least 10', 'sees significant growth'));
  const { status, output } = validate(dir);
  assert.equal(status, 0, output);
  assert.match(output, /P2030-001\.yml:4: warning: claim: vague word "significant"/);
  assert.match(output, /1 predictions, 0 errors, 1 warnings/);
});

test('YAML syntax errors are reported with file and line', async () => {
  const dir = await tempDir();
  await writeFile(join(dir, 'P2030-001.yml'), 'id: P2030-001\ntitle: [unclosed\n');
  const { status, output } = validate(dir);
  assert.equal(status, 1, output);
  assert.match(output, /P2030-001\.yml:\d+: error: yaml: /);
});

test('an empty predictions directory exits 0 with "0 predictions"', async () => {
  const dir = await tempDir();
  await mkdir(join(dir, 'predictions'));
  const { status, output } = validate(join(dir, 'predictions'));
  assert.equal(status, 0, output);
  assert.match(output, /0 predictions/);
});

test('a path that does not exist is an error', () => {
  const { status, output } = validate(join(root, 'no-such-dir'));
  assert.equal(status, 1, output);
  assert.match(output, /no-such-dir: error: /);
});
