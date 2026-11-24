// Checks the built site: `node scripts/check-sources.mjs [dir]` (default dist/). Runs as `postbuild`,
// so `npm run build` fails when any page has an <img> without an alt attribute.
// alt="" is allowed: it is how WAI marks a decorative image. The citation checks land here later.
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

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = process.argv[2] ?? 'dist';
  const problems = await checkDir(dir);
  for (const p of problems) console.error(p);
  console.log(`check-sources: ${relative(process.cwd(), dir) || dir}: ${problems.length} image(s) without alt`);
  process.exit(problems.length ? 1 : 0);
}
