import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { externalArgs } from '../scripts/check-links.mjs';

const script = fileURLToPath(new URL('../scripts/check-links.mjs', import.meta.url));
// Without lychee the `links` step of `npm run check` fails with the install link; skip here so it is that step that says so.
const skip = spawnSync('lychee', ['--version']).error ? 'lychee not installed (https://lychee.cli.rs/installation/)' : false;
const html = (body) => `<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`;

async function site(pages) {
  const dir = await mkdtemp(join(tmpdir(), 'links-'));
  for (const [path, body] of Object.entries(pages)) {
    await mkdir(join(dir, path, '..'), { recursive: true });
    await writeFile(join(dir, path), html(body));
  }
  return dir;
}

const run = (dir) => spawnSync(process.execPath, [script, dir], { encoding: 'utf8' });

test('internal links that resolve pass, and external links are not fetched', { skip }, async () => {
  const dir = await site({
    'index.html': '<a href="/guide/">guide</a> <a href="guide/">relative</a> <a href="https://example.invalid/x">external</a>',
    'guide/index.html': '<a href="/">home</a>',
  });
  const { status, stdout, stderr } = run(dir);
  assert.equal(status, 0, stdout + stderr);
});

test('a broken internal link fails the check and names the target', { skip }, async () => {
  const dir = await site({ 'index.html': '<a href="/missing-page/">gone</a>' });
  const { status, stdout, stderr } = run(dir);
  assert.notEqual(status, 0);
  assert.match(stdout + stderr, /missing-page/);
});

test('the external check reads source URLs from .yml predictions', { skip }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'links-'));
  await writeFile(join(dir, 'p.yml'), 'sources:\n  - url: https://dead-source.horizon-arch.org/report\n');
  // --dump lists extracted links without fetching them (off the network). Not .test/example.*: lychee drops reserved domains.
  const { status, stdout, stderr } = spawnSync('lychee', ['--no-progress', '--dump', ...externalArgs(dir, [dir])], { encoding: 'utf8', cwd: dir });
  assert.equal(status, 0, stdout + stderr);
  assert.match(stdout, /dead-source\.horizon-arch\.org\/report/);
});

test('npm run check runs the internal link step', async () => {
  const { readFile } = await import('node:fs/promises');
  const check = await readFile(fileURLToPath(new URL('../scripts/check.mjs', import.meta.url)), 'utf8');
  assert.match(check, /'npm run check:links'/);
  assert.doesNotMatch(check, /check:links:external/);
});
