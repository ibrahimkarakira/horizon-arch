import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildScoreboard, loadPredictions, writeScoreboard } from '../scripts/scoreboard.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixtures = join(root, 'tests', 'fixtures', 'scoreboard');
const TODAY = '2026-11-25';
const predictions = await loadPredictions(fixtures);

test('Brier score over the 4 resolved fixtures matches the hand calculation', () => {
  // (0.80-1)^2 + (0.60-0)^2 + (0.25-0)^2 + (0.90-1)^2 = 0.04 + 0.36 + 0.0625 + 0.01 = 0.4725; / 4 = 0.118125
  const { scoreboard } = buildScoreboard(predictions, TODAY);
  assert.equal(scoreboard.brier_n, 4);
  assert.equal(scoreboard.brier.toFixed(4), '0.1181');
  assert.equal(scoreboard.calibration_claim, false);
});

test('ambiguous resolutions are not scored', () => {
  const withAmbiguous = predictions.map((p) => (p.id === 'P2050-102' ? { ...p, status: 'ambiguous' } : p));
  const { scoreboard } = buildScoreboard(withAmbiguous, TODAY);
  assert.equal(scoreboard.brier_n, 3);
  assert.equal(scoreboard.brier.toFixed(4), '0.1542'); // (0.04 + 0.36 + 0.0625) / 3
});

test('with 0 resolved, Brier is null and there is no calibration claim', () => {
  const { scoreboard } = buildScoreboard(predictions.filter((p) => p.status === 'open'), TODAY);
  assert.equal(scoreboard.brier, null);
  assert.equal(scoreboard.brier_n, 0);
  assert.equal(scoreboard.calibration_claim, false);
});

test('empty input gives zero counts and no checkpoints', () => {
  const { scoreboard, changelog } = buildScoreboard([], TODAY);
  assert.equal(scoreboard.counts.total, 0);
  assert.equal(scoreboard.brier, null);
  assert.deepEqual(scoreboard.upcoming_checkpoints, []);
  assert.deepEqual(changelog, []);
});

test('counts by horizon and status', () => {
  const { counts } = buildScoreboard(predictions, TODAY).scoreboard;
  assert.equal(counts.total, 7);
  assert.deepEqual(counts.by_status, {
    open: 3, checkpoint_met: 0, checkpoint_missed: 0, resolved_true: 2, resolved_false: 2, ambiguous: 0, withdrawn: 0,
  });
  assert.equal(counts.by_horizon['2030'].total, 4);
  assert.equal(counts.by_horizon['2030'].open, 2);
  assert.equal(counts.by_horizon['2050'].resolved_false, 1);
  assert.equal(counts.by_horizon['2100'].total, 1);
});

test('upcoming checkpoints are sorted by date and exclude past ones', () => {
  const { upcoming_checkpoints } = buildScoreboard(predictions, TODAY).scoreboard;
  // P2100-101 (2026-06-30) is past; resolved predictions have no pending checkpoint.
  assert.deepEqual(upcoming_checkpoints.map((c) => `${c.date} ${c.id}`), ['2026-12-31 P2030-104', '2027-03-31 P2030-103']);
  // A checkpoint due today is still upcoming.
  const onTheDay = buildScoreboard(predictions, '2026-12-31').scoreboard.upcoming_checkpoints;
  assert.equal(onTheDay[0].id, 'P2030-104');
});

test('changelog lists creations, revisions and resolutions ordered by date then id', () => {
  const { changelog } = buildScoreboard(predictions, TODAY);
  assert.deepEqual(changelog.map((e) => `${e.date} ${e.id} ${e.type}`), [
    '2026-01-05 P2100-101 created',
    '2026-01-10 P2030-101 created',
    '2026-01-10 P2030-102 created',
    '2026-01-10 P2030-103 created',
    '2026-02-01 P2030-102 revised',
    '2026-02-01 P2050-101 created',
    '2026-02-01 P2050-102 created',
    '2026-03-15 P2030-104 created',
    '2026-09-30 P2030-101 resolved',
    '2026-09-30 P2030-102 resolved',
    '2026-10-15 P2050-101 resolved',
    '2026-10-15 P2050-102 resolved',
  ]);
});

test('input order does not change the output', () => {
  const a = JSON.stringify(buildScoreboard(predictions, TODAY));
  const b = JSON.stringify(buildScoreboard([...predictions].reverse(), TODAY));
  assert.equal(a, b);
});

test('written files are byte-identical on two runs', async () => {
  const read = async (dir) => [await readFile(join(dir, 'scoreboard.json')), await readFile(join(dir, 'changelog.json'))];
  const first = await mkdtemp(join(tmpdir(), 'horizon-scoreboard-'));
  const second = await mkdtemp(join(tmpdir(), 'horizon-scoreboard-'));
  await writeScoreboard(fixtures, first, TODAY);
  await writeScoreboard(fixtures, second, TODAY);
  const [[s1, c1], [s2, c2]] = [await read(first), await read(second)];
  assert.ok(s1.equals(s2) && c1.equals(c2));
});

test('the CLI writes both files and reports the counts', async () => {
  const out = await mkdtemp(join(tmpdir(), 'horizon-scoreboard-'));
  const script = join(root, 'scripts', 'scoreboard.mjs');
  const { status, stdout, stderr } = spawnSync(process.execPath, [script, fixtures, out], { cwd: root, encoding: 'utf8' });
  assert.equal(status, 0, stdout + stderr);
  assert.match(stdout, /7 predictions, 4 scored, 12 changelog entries/);
  assert.equal(JSON.parse(await readFile(join(out, 'scoreboard.json'), 'utf8')).counts.total, 7);
});
