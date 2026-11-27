// Link checks with lychee (https://lychee.cli.rs/). Policy: docs/link-policy.md.
// `node scripts/check-links.mjs [distDir]`: internal links in the built site, offline. Step `links` of
//   `npm run check`; a link to a page or file that is not in dist/ fails it.
// `node scripts/check-links.mjs --external`: source URLs in src/content/docs/ and predictions/, over the
//   network, with retries and a cache. Not part of `npm run check`; writes reports/links-external.md.
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = resolve(root, '.lychee.toml');
const report = resolve(root, 'reports/links-external.md');
// lychee reads only its default extensions (md, html, txt, ...) from a directory; predictions are .yml.
export const EXTERNAL_EXTENSIONS = 'md,mdx,yml,yaml';

// --root-dir must be absolute: lychee resolves `/page/` links against it.
export function internalArgs(dist) {
  return ['--config', config, '--offline', '--root-dir', dist, '--index-files', 'index.html', dist];
}

// --root-dir here turns root-relative page links into file:// URLs, which --scheme then skips.
export function externalArgs(dist, inputs = [resolve(root, 'src/content/docs'), resolve(root, 'predictions')]) {
  return ['--config', config, '--cache', '--scheme', 'https', '--scheme', 'http', '--root-dir', dist,
    '--extensions', EXTERNAL_EXTENSIONS, ...inputs];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const flags = process.argv.slice(2);
  const external = flags.includes('--external');
  const dist = resolve(flags.find((a) => !a.startsWith('--')) ?? resolve(root, 'dist'));
  const args = external
    ? ['--format', 'markdown', '--output', report, ...externalArgs(dist)]
    : internalArgs(dist);

  if (external) mkdirSync(resolve(root, 'reports'), { recursive: true });
  // cwd = repo root so the external run's .lycheecache always lands in the same place.
  const { status, error } = spawnSync('lychee', ['--no-progress', ...args], { stdio: 'inherit', cwd: root });
  if (error) {
    console.error(`check-links: could not run lychee (${error.message}). Install it: https://lychee.cli.rs/installation/`);
    process.exit(1);
  }
  if (external) console.log(`\ncheck-links: report written to ${report}`);
  process.exit(status ?? 1);
}
