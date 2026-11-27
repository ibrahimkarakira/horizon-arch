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

// Included rows keep their CSV line, so every number derived from them can cite its row.
export function lifetimes(rows) {
  const included = [];
  const excluded = [];
  for (const r of rows) {
    if (!r.released) excluded.push({ model: r.model, reason: 'missing released' });
    else if (!r.deprecation_announced) excluded.push({ model: r.model, reason: 'missing deprecation_announced' });
    else if (days(r.released, r.deprecation_announced) < 0) excluded.push({ model: r.model, reason: 'deprecation_announced before released' });
    else included.push({ line: r.line, vendor: r.vendor, model: r.model, days: days(r.released, r.deprecation_announced) });
  }
  return { included, excluded };
}

const median = (sorted) => {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length === 0 ? null : sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// Quartiles are the medians of the lower and upper halves; an odd n leaves the median out of both (Tukey).
export function spread(values) {
  if (values.length === 0) return null;
  const s = values.toSorted((a, b) => a - b);
  const half = Math.floor(s.length / 2);
  const lower = s.slice(0, half);
  const upper = s.slice(s.length - half);
  return { min: s[0], q1: median(lower.length ? lower : s), median: median(s), q3: median(upper.length ? upper : s), max: s.at(-1) };
}

export function halfLife(rows) {
  const { included, excluded } = lifetimes(rows);
  return { n: included.length, median: median(included.map((x) => x.days).toSorted((a, b) => a - b)), excluded };
}

// Strip plot: one dot per included row, one band per vendor (CSV order), a tick at each vendor's median
// and a dashed line at the overall median. Equal values in a band stack upwards instead of overlapping.
export function chartSvg(rows) {
  const { included } = lifetimes(rows);
  const vendors = [...new Set(included.map((x) => x.vendor))];
  const all = spread(included.map((x) => x.days));
  const [W, H, L, R, T, B] = [720, 320, 150, 24, 48, 64];
  const xMax = Math.max(100, Math.ceil((all?.max ?? 0) / 100) * 100);
  const x = (d) => +(L + (d / xMax) * (W - L - R)).toFixed(1);
  const band = (H - T - B) / Math.max(1, vendors.length);
  const mid = (i) => +(T + band * (i + 0.5)).toFixed(1);
  const title = `Days from release to deprecation notice, by vendor (n = ${included.length})`;
  const perVendor = vendors.map((v) => ({ v, s: spread(included.filter((y) => y.vendor === v).map((y) => y.days)), n: included.filter((y) => y.vendor === v).length }));
  const desc = `Strip plot of ${included.length} model versions from data/model-lifetimes.csv, one dot each, placed by days from release to the vendor's deprecation notice. `
    + perVendor.map(({ v, n, s }) => `${v}: n = ${n}, median ${s.median} days, range ${s.min} to ${s.max}.`).join(' ')
    + (all ? ` All vendors: median ${all.median} days, shown as a dashed line.` : '');
  const ticks = Array.from({ length: xMax / 100 + 1 }, (_, i) => i * 100);
  const seen = new Map();
  const dots = included.map((d) => {
    const key = `${d.vendor}|${d.days}`;
    const k = seen.get(key) ?? 0;
    seen.set(key, k + 1);
    return `<circle class="ha-dot" cx="${x(d.days)}" cy="${+(mid(vendors.indexOf(d.vendor)) + 8 - 6 * k).toFixed(1)}" r="4"><title>${d.model}: ${d.days} days (line ${d.line})</title></circle>`;
  });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="model-lifetimes-title model-lifetimes-desc">`,
    `  <title id="model-lifetimes-title">${title}</title>`,
    `  <desc id="model-lifetimes-desc">${desc}</desc>`,
    '  <style>',
    '    /* Generated by `node scripts/model-halflife.mjs --svg`; do not edit by hand. Fallbacks are the light theme. */',
    '    .ha-bg { fill: var(--ha-surface, #ffffff); }',
    '    .ha-axis { stroke: var(--ha-line, #5c6270); stroke-width: 1; }',
    '    .ha-dot { fill: var(--ha-line, #5c6270); fill-opacity: 0.7; }',
    '    .ha-median { stroke: var(--ha-ink, #1b1d22); stroke-width: 2.5; }',
    '    .ha-all { stroke: var(--ha-ink, #1b1d22); stroke-width: 1; stroke-dasharray: 4 4; }',
    '    text { fill: var(--ha-ink, #1b1d22); font: 13px system-ui, sans-serif; }',
    '    .ha-small { fill: var(--ha-line, #5c6270); font-size: 11px; }',
    '  </style>',
    `  <rect class="ha-bg" width="${W}" height="${H}"/>`,
    `  <text x="${L}" y="24">${title}</text>`,
    `  <line class="ha-axis" x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}"/>`,
    ...ticks.map((t) => `  <text class="ha-small" x="${x(t)}" y="${H - B + 16}" text-anchor="middle">${t}</text>`),
    `  <text x="${x(xMax / 2)}" y="${H - 16}" text-anchor="middle">Days from release to deprecation notice</text>`,
    `  <text x="16" y="${mid(0) - band / 2 + 4}">Vendor</text>`,
    ...perVendor.flatMap(({ v, s, n }, i) => [
      `  <text x="16" y="${mid(i) + 4}">${v} (n = ${n})</text>`,
      `  <line class="ha-median" x1="${x(s.median)}" y1="${mid(i) - 18}" x2="${x(s.median)}" y2="${mid(i) + 18}"/>`,
    ]),
    ...(all ? [
      `  <line class="ha-all" x1="${x(all.median)}" y1="${T - 6}" x2="${x(all.median)}" y2="${H - B}"/>`,
      `  <text class="ha-small" x="${x(all.median) + 4}" y="${T - 8}">all: median ${all.median}</text>`,
    ] : []),
    // One line of dots per vendor keeps the generated file short enough to review as a diff.
    ...vendors.map((v) => `  <g>${dots.filter((_, i) => included[i].vendor === v).join('')}</g>`),
    '</svg>',
    '',
  ].join('\n');
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
  if (process.argv.includes('--svg')) process.stdout.write(chartSvg(rows));
  else console.log(report(halfLife(rows)));
}
