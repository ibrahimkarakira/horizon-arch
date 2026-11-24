// Generates the scoreboard and changelog data: `node scripts/scoreboard.mjs [predictions-dir] [out-dir]`
// (defaults: predictions/ and src/data/). Writes scoreboard.json and changelog.json. Run after the validator;
// files that do not match the schema stop the run. Output depends only on the files and `today`, so two runs
// on the same day are byte-identical.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { CHECKPOINT_WINDOW_YEARS, predictionSchema } from '../schema/prediction.schema.mjs';

// Below this many scored predictions the site makes no calibration claim (ROADMAP: "no calibration claim below n = 20").
export const CALIBRATION_MIN_N = 20;

const STATUSES = predictionSchema.shape.status.options;
const HORIZONS = Object.keys(CHECKPOINT_WINDOW_YEARS);
// Only these resolve a binary claim; `ambiguous` and `withdrawn` are not scored.
const OUTCOME = { resolved_true: 1, resolved_false: 0 };
const TYPE_ORDER = ['created', 'revised', 'resolved'];

const byKeys = (...keys) => (a, b) => {
  for (const key of keys) {
    const [x, y] = [key(a), key(b)];
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
};

const tally = (items) => Object.fromEntries(STATUSES.map((s) => [s, items.filter((p) => p.status === s).length]));

// Brier score (Brier 1950, binary form): mean of (forecast - outcome)^2, forecast = probability / 100.
function brier(predictions) {
  const scored = predictions.filter((p) => p.status in OUTCOME);
  if (!scored.length) return { brier: null, brier_n: 0 };
  const sum = scored.reduce((acc, p) => acc + (p.probability / 100 - OUTCOME[p.status]) ** 2, 0);
  return { brier: Math.round((sum / scored.length) * 1e4) / 1e4, brier_n: scored.length };
}

// Pure: same predictions (in any order) and `today` (YYYY-MM-DD) give the same result.
export function buildScoreboard(predictions, today) {
  const sorted = [...predictions].sort(byKeys((p) => p.id));
  const score = brier(sorted);
  const by_horizon = Object.fromEntries(
    HORIZONS.map((h) => {
      const items = sorted.filter((p) => String(p.horizon) === h);
      return [h, { total: items.length, ...tally(items) }];
    }),
  );
  const upcoming_checkpoints = sorted
    .filter((p) => p.status === 'open' && p.checkpoint_date >= today)
    .map((p) => ({ date: p.checkpoint_date, id: p.id, title: p.title, signal: p.checkpoint_signal }))
    .sort(byKeys((c) => c.date, (c) => c.id));
  const changelog = sorted
    .flatMap((p) => [
      { date: p.created, id: p.id, type: 'created', title: p.title },
      ...(p.revisions ?? []).map((r) => ({ date: r.date, id: p.id, type: 'revised', probability: r.probability, reason: r.reason })),
      ...(p.resolved_on ? [{ date: p.resolved_on, id: p.id, type: 'resolved', status: p.status, note: p.resolution_note }] : []),
    ])
    .sort(byKeys((e) => e.date, (e) => e.id, (e) => TYPE_ORDER.indexOf(e.type)));
  const scoreboard = {
    as_of: today,
    counts: { total: sorted.length, by_status: tally(sorted), by_horizon },
    ...score,
    calibration_claim: score.brier_n >= CALIBRATION_MIN_N,
    upcoming_checkpoints,
  };
  return { scoreboard, changelog };
}

export async function loadPredictions(dir) {
  const files = (await readdir(dir)).filter((f) => ['.yml', '.yaml'].includes(extname(f))).sort();
  return Promise.all(
    files.map(async (f) => {
      const result = predictionSchema.safeParse(parse(await readFile(join(dir, f), 'utf8')));
      if (!result.success) throw new Error(`${join(dir, f)} is not a valid prediction; run npm run validate`);
      return result.data;
    }),
  );
}

export async function writeScoreboard(dir, outDir, today) {
  const { scoreboard, changelog } = buildScoreboard(await loadPredictions(dir), today);
  await mkdir(outDir, { recursive: true });
  const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(join(outDir, 'scoreboard.json'), json(scoreboard));
  await writeFile(join(outDir, 'changelog.json'), json(changelog));
  return { scoreboard, changelog };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [dir = 'predictions', outDir = join('src', 'data')] = process.argv.slice(2);
  // The machine's local calendar date (en-CA formats as YYYY-MM-DD), so a 01:00 local run is not dated yesterday.
  const today = new Date().toLocaleDateString('en-CA');
  const { scoreboard, changelog } = await writeScoreboard(dir, outDir, today);
  console.log(`${scoreboard.counts.total} predictions, ${scoreboard.brier_n} scored, ${changelog.length} changelog entries -> ${outDir}`);
}
