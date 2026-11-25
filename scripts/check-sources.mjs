// `node scripts/check-sources.mjs [distDir] [contentDir]` (defaults dist/ and src/content/docs/).
// Runs as `postbuild` and as the `sources` step of `npm run check`. Two checks:
// 1. Built site: no <img> without an alt attribute (alt="" is allowed: WAI's mark for a decorative image).
// 2. Content: every footnote is `[^n]: Title, URL, accessed YYYY-MM-DD`, every reference has a
//    definition and every definition is referenced; [UNCLEAR] only on drafts. Drafts
//    (frontmatter `draft: true`) are exempt. Policy: docs/sourcing-policy.md.
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// ponytail: regex over HTML, fine for Astro's own output; an alt value containing ">" would slip through.
export const imagesWithoutAlt = (html) =>
  (html.match(/<img\b[^>]*>/gi) ?? []).filter((tag) => !/\salt\s*=/i.test(tag));

export async function checkDir(dir) {
  const problems = [];
  for (const file of await readdir(dir, { recursive: true })) {
    if (!file.endsWith('.html')) continue;
    for (const tag of imagesWithoutAlt(await readFile(join(dir, file), 'utf8'))) {
      problems.push(`${file}: <img> without alt: ${tag}`);
    }
  }
  return problems;
}

const DEFINITION = /^\[\^([^\]\s]+)\]:\s*(.*)$/;
const REFERENCE = /\[\^([^\]\s]+)\](?!:)/g;
const ACCESSED = /,\s*accessed (\d{4}-\d{2}-\d{2})\s*$/;
export const isRealDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d);

const isDraft = (text) => {
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return Boolean(frontmatter && /^draft:\s*true\s*$/m.test(frontmatter[1]));
};

// ponytail: line-based scan, not a Markdown parser. Fenced blocks and inline code spans are skipped;
// footnotes inside HTML or JSX attributes are not special-cased.
export function checkSources(text, file) {
  if (isDraft(text)) return [];
  const problems = [];
  const refs = new Map(); // id -> first line referenced
  const defs = new Map(); // id -> line defined
  let fence = null; // { marker: '```' or longer run, line } while inside a fenced block
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    // CommonMark: a fence closes only on the same character, at least as many, and nothing after it.
    if (fence) {
      const close = raw.match(/^\s*(`{3,}|~{3,})\s*$/);
      if (close && close[1][0] === fence.marker[0] && close[1].length >= fence.marker.length) fence = null;
      return;
    }
    const open = raw.match(/^\s*(`{3,}|~{3,})/);
    if (open) {
      fence = { marker: open[1], line };
      return;
    }
    const prose = raw.replace(/`[^`]*`/g, '');
    if (prose.includes('[UNCLEAR]')) problems.push([line, '[UNCLEAR] is allowed only on drafts (frontmatter draft: true)']);
    const def = prose.match(DEFINITION);
    if (def) {
      const [, id, body] = def;
      defs.set(id, line);
      const accessed = body.match(ACCESSED);
      // An archive link is not the source: drop `(archived ...)` before looking for the URL.
      if (!/https?:\/\/\S/.test(body.replace(/\(archived\s[^)]*\)/gi, ''))) problems.push([line, `footnote [^${id}] has no URL`]);
      if (!accessed) problems.push([line, `footnote [^${id}] has no access date (expected "accessed YYYY-MM-DD")`]);
      else if (!isRealDate(accessed[1])) problems.push([line, `footnote [^${id}] has an invalid access date ${accessed[1]}`]);
      return;
    }
    for (const [, id] of prose.matchAll(REFERENCE)) if (!refs.has(id)) refs.set(id, line);
  });
  if (fence) problems.push([fence.line, 'code fence opened here is never closed (the rest of the page is not checked)']);
  for (const [id, line] of refs) if (!defs.has(id)) problems.push([line, `footnote reference [^${id}] has no definition`]);
  for (const [id, line] of defs) if (!refs.has(id)) problems.push([line, `footnote [^${id}] is defined but never referenced`]);
  return problems.sort((a, b) => a[0] - b[0]).map(([line, message]) => `${file}:${line}: ${message}`);
}

export async function checkContent(dir) {
  const problems = [];
  for (const file of await readdir(dir, { recursive: true })) {
    if (!/\.mdx?$/.test(file)) continue;
    const path = join(dir, file);
    problems.push(...checkSources(await readFile(path, 'utf8'), relative(process.cwd(), path)));
  }
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [dist = 'dist', content = join('src', 'content', 'docs')] = process.argv.slice(2);
  const images = await checkDir(dist);
  const sources = await checkContent(content);
  for (const p of [...images, ...sources]) console.error(p);
  console.log(`check-sources: ${relative(process.cwd(), dist) || dist}: ${images.length} image(s) without alt`);
  console.log(`check-sources: ${relative(process.cwd(), content) || content}: ${sources.length} citation problem(s)`);
  process.exit(images.length || sources.length ? 1 : 0);
}
