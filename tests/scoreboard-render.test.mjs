import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildScoreboard, loadPredictions } from '../scripts/scoreboard.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const TODAY = '2026-11-25';

// Builds the site with SCOREBOARD_DATA pointing at `scoreboard` and returns the scoreboard page HTML.
// Calls `astro build` directly (no prebuild), so src/data/ is not touched.
async function renderWith(scoreboard) {
  const dir = await mkdtemp(join(tmpdir(), 'horizon-scoreboard-'));
  const data = join(dir, 'scoreboard.json');
  await writeFile(data, JSON.stringify(scoreboard));
  const outDir = join(dir, 'dist');
  const { status, stderr, stdout } = spawnSync(`npx astro build --outDir "${outDir}"`, {
    cwd: root,
    shell: true,
    encoding: 'utf8',
    env: { ...process.env, SCOREBOARD_DATA: data },
  });
  assert.equal(status, 0, `astro build failed:\n${stdout}\n${stderr}`);
  return readFile(join(outDir, 'scoreboard', 'index.html'), 'utf8');
}

// Reads the built site, so `npm run build` must run first (scripts/check.mjs does that).
test('the site build has a scoreboard page', async () => {
  const html = await readFile(join(root, 'dist', 'scoreboard', 'index.html'), 'utf8');
  assert.match(html, /class="scoreboard/);
});

test('empty data renders the honest empty state and no chart', async () => {
  const html = await renderWith(buildScoreboard([], TODAY).scoreboard);
  assert.match(html, /0 published predictions yet/);
  assert.doesNotMatch(html, /<svg[^>]*role="img"/);
  assert.match(html, /No upcoming checkpoints/);
});

test('fixture data renders an accessible bar, n next to every score, and the checkpoint table', async () => {
  const predictions = await loadPredictions(join(root, 'tests', 'fixtures', 'scoreboard'));
  const html = await renderWith(buildScoreboard(predictions, TODAY).scoreboard);
  assert.doesNotMatch(html, /0 published predictions yet/);
  // One labelled SVG per horizon: role, <title> and a text alternative.
  const svgs = html.match(/<svg[^>]*role="img"[^>]*>[\s\S]*?<\/svg>/g) ?? [];
  assert.equal(svgs.length, 3);
  for (const svg of svgs) {
    assert.match(svg, /aria-labelledby="[^"]+"/);
    assert.match(svg, /<title id="[^"]+"[^>]*>[^<]+<\/title>/);
    assert.match(svg, /<desc id="[^"]+"[^>]*>[^<]+<\/desc>/);
  }
  assert.match(html, /2030: 4 predictions \(n = 4\)/);
  assert.match(html, /2 open, 1 resolved true, 1 resolved false/);
  assert.match(html, /Brier score 0\.1181 \(n = 4\)/);
  assert.match(html, /No calibration claim below n = 20/);
  assert.match(html, /<td[^>]*>2026-12-31<\/td>\s*<td[^>]*>P2030-104<\/td>/);
  assert.match(html, /<td[^>]*>2027-03-31<\/td>\s*<td[^>]*>P2030-103<\/td>/);
});

// The CSS in Scoreboard.astro names each status by hand; a status added to the schema without a
// matching .status-<s> rule would render as a black bar segment and an empty legend swatch.
test('Scoreboard.astro has a colour rule for every schema status', async () => {
  const { predictionSchema } = await import('../schema/prediction.schema.mjs');
  const css = await readFile(join(root, 'src', 'components', 'Scoreboard.astro'), 'utf8');
  for (const s of predictionSchema.shape.status.options) {
    assert.ok(css.includes(`.status-${s} { fill: var(--sb-${s});`), `no .status-${s} rule`);
    assert.ok(css.includes(`--sb-${s}: #`), `no --sb-${s} colour`);
  }
});
