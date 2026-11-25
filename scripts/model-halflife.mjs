// Median days from a model version's release to its deprecation notice, from data/model-lifetimes.csv.
// Rows missing either date are excluded with a reason, never imputed. Exits 1 if any row lacks
// a source URL or access date, or carries an impossible date. Output is deterministic.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isRealDate } from './check-sources.mjs';

// notes_source_url and notes_accessed: the vendor release notes or launch post that gave a date the
// deprecation page (source_url) does not state. Blank when every date comes from the deprecation page.
const COLUMNS = ['vendor', 'model', 'released', 'deprecation_announced', 'retired', 'source_url', 'accessed', 'notes_source_url', 'notes_accessed'];
const DAY_MS = 86_400_000;

// ponytail: plain comma split, no quoting; a field with a comma fails the field-count check.
export function parseCsv(text) {
  const [header, ...lines] = text.split(/\r?\n/);
  if (header !== COLUMNS.join(',')) throw new Error(`header must be: ${COLUMNS.join(',')}`);
  return lines.flatMap((line, i) => {
    if (line.trim() === '') return [];
    const fields = line.split(',');
    if (fields.length !== COLUMNS.length) throw new Error(`line ${i + 2}: expected ${COLUMNS.length} fields, got ${fields.length}`);
    return [{ line: i + 2, ...Object.fromEntries(COLUMNS.map((c, j) => [c, fields[j].trim()])) }];
  });
}

export function checkRows(rows) {
  return rows.flatMap((r) => {
    const at = `line ${r.line} (${r.model})`;
    if (!/^https?:\/\/\S+$/.test(r.source_url)) return [`${at}: source_url must be an http(s) URL`];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.accessed)) return [`${at}: accessed must be a YYYY-MM-DD date`];
    if (!r.notes_source_url !== !r.notes_accessed) return [`${at}: notes_source_url and notes_accessed must be set together`];
    if (r.notes_source_url && !/^https?:\/\/\S+$/.test(r.notes_source_url)) return [`${at}: notes_source_url must be an http(s) URL`];
    return ['released', 'deprecation_announced', 'retired', 'accessed', 'notes_accessed']
      .filter((c) => r[c] !== '' && !isRealDate(r[c]))
      .map((c) => `${at}: ${c} is not a real date: ${r[c]}`);
  });
}

// YYYY-MM-DD is parsed as UTC midnight, so the difference is a whole number of days.
const days = (from, to) => (Date.parse(to) - Date.parse(from)) / DAY_MS;

export function halfLife(rows) {
  const lifetimes = [];
  const excluded = [];
  for (const r of rows) {
    if (!r.released) excluded.push({ model: r.model, reason: 'missing released' });
    else if (!r.deprecation_announced) excluded.push({ model: r.model, reason: 'missing deprecation_announced' });
    else if (days(r.released, r.deprecation_announced) < 0) excluded.push({ model: r.model, reason: 'deprecation_announced before released' });
    else lifetimes.push(days(r.released, r.deprecation_announced));
  }
  const sorted = lifetimes.toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length === 0 ? null : sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { n: sorted.length, median, excluded };
}

export function report({ n, median, excluded }) {
  const reasons = Object.entries(Object.groupBy(excluded, (e) => e.reason))
    .map(([reason, list]) => `  ${reason}: ${list.length}`)
    .toSorted();
  return [`n=${n} median_days=${median ?? 'n/a'} excluded=${excluded.length}`, ...reasons].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = fileURLToPath(new URL('../data/model-lifetimes.csv', import.meta.url));
  const rows = parseCsv(await readFile(file, 'utf8'));
  const problems = checkRows(rows);
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(report(halfLife(rows)));
}
