import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSources } from '../scripts/check-sources.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const page = (body, frontmatter = 'title: Test') => `---\n${frontmatter}\n---\n\n${body}\n`;

test('a footnote without an access date fails with file and line', () => {
  const text = page('A claim.[^1]\n\n[^1]: Some report, https://example.org/report');
  assert.deepEqual(checkSources(text, 'essays/a.md'), [
    'essays/a.md:7: footnote [^1] has no access date (expected "accessed YYYY-MM-DD")',
  ]);
});

test('a footnote without a URL fails with file and line', () => {
  const text = page('A claim.[^a]\n\n[^a]: Some report, accessed 2026-11-20');
  assert.deepEqual(checkSources(text, 'a.md'), ['a.md:7: footnote [^a] has no URL']);
});

test('an archive link alone does not count as the source URL', () => {
  const text = page('A claim.[^1]\n\n[^1]: Report (archived https://web.archive.org/x), accessed 2026-11-20');
  assert.deepEqual(checkSources(text, 'a.md'), ['a.md:7: footnote [^1] has no URL']);
});

test('an impossible access date fails', () => {
  const text = page('A claim.[^1]\n\n[^1]: Some report, https://example.org, accessed 2026-02-30');
  assert.deepEqual(checkSources(text, 'a.md'), ['a.md:7: footnote [^1] has an invalid access date 2026-02-30']);
});

test('a reference with no definition fails at the reference line', () => {
  const text = page('First.[^1] Second.[^2]\n\n[^1]: Some report, https://example.org, accessed 2026-11-20');
  assert.deepEqual(checkSources(text, 'a.md'), ['a.md:5: footnote reference [^2] has no definition']);
});

test('a definition that is never referenced is flagged', () => {
  const text = page('No references here.\n\n[^9]: Some report, https://example.org, accessed 2026-11-20');
  assert.deepEqual(checkSources(text, 'a.md'), ['a.md:7: footnote [^9] is defined but never referenced']);
});

test('a page with 3 valid footnotes passes', () => {
  const text = page([
    'One.[^1] Two.[^2] Three.[^note-3] One again.[^1]',
    '',
    '[^1]: Report one, https://example.org/one, accessed 2026-11-01',
    '[^2]: Report two, https://example.org/two (archived https://web.archive.org/web/2026/https://example.org/two), accessed 2026-11-02',
    '[^note-3]: Report three, http://example.org/three, accessed 2026-11-03',
  ].join('\n'));
  assert.deepEqual(checkSources(text, 'a.md'), []);
});

test('[UNCLEAR] on a published page fails; a draft is exempt', () => {
  assert.deepEqual(checkSources(page('This holds. [UNCLEAR]'), 'a.md'), [
    'a.md:5: [UNCLEAR] is allowed only on drafts (frontmatter draft: true)',
  ]);
  assert.deepEqual(checkSources(page('This holds. [UNCLEAR]', 'title: Test\ndraft: false'), 'a.md').length, 1);
  assert.deepEqual(checkSources(page('This holds. [UNCLEAR] Also.[^1]', 'title: Test\ndraft: true'), 'a.md'), []);
});

test('[UNCLEAR] and footnote syntax inside code are ignored', () => {
  const text = page('Mark it `[UNCLEAR]` and cite with `[^1]`.\n\n```md\n[UNCLEAR] claim.[^2]\n[^3]: no url\n```');
  assert.deepEqual(checkSources(text, 'a.md'), []);
});

test('a fence closes only on the same marker at least as long; prose after it is still checked', () => {
  const mixed = page('~~~\n```\n~~~\n[UNCLEAR]');
  assert.deepEqual(checkSources(mixed, 'a.md'), ['a.md:8: [UNCLEAR] is allowed only on drafts (frontmatter draft: true)']);
  const longer = page('````md\n```\n[UNCLEAR] inside\n````\n[UNCLEAR]');
  assert.deepEqual(checkSources(longer, 'a.md'), ['a.md:9: [UNCLEAR] is allowed only on drafts (frontmatter draft: true)']);
});

test('an unclosed fence is flagged at its opening line', () => {
  assert.deepEqual(checkSources(page('Text.\n\n```js\n[UNCLEAR] hidden'), 'a.md'), [
    'a.md:7: code fence opened here is never closed (the rest of the page is not checked)',
  ]);
});

test('check-sources CLI exits 1 and names file and line for a bad content page', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'horizon-sources-'));
  const [dist, content] = [join(tmp, 'dist'), join(tmp, 'content')];
  await mkdir(dist);
  await mkdir(join(content, 'essays'), { recursive: true });
  await writeFile(join(content, 'essays', 'bad.mdx'), page('Claim.[^1]\n\n[^1]: Report, https://example.org'));
  await writeFile(join(content, 'ok.md'), page('Claim.[^1]\n\n[^1]: Report, https://example.org, accessed 2026-11-20'));
  const { status, stdout, stderr } = spawnSync(process.execPath, ['scripts/check-sources.mjs', dist, content], { cwd: root, encoding: 'utf8' });
  assert.equal(status, 1, stdout + stderr);
  assert.match(stderr, /essays[\\/]bad\.mdx:7: footnote \[\^1\] has no access date/);
  assert.doesNotMatch(stderr, /ok\.md/);
});

test('the essay and page templates carry a Sources checked block and pass once published', async () => {
  for (const name of ['essay.mdx', 'page.mdx']) {
    const text = await readFile(join(root, 'templates', name), 'utf8');
    assert.match(text, /^draft: true$/m, name);
    assert.match(text, /^## Sources checked$/m, name);
    assert.deepEqual(checkSources(text.replace(/^draft: true$/m, 'draft: false'), name), [], name);
  }
});

test('the sourcing policy states the format, archive and [UNCLEAR] rules', async () => {
  const doc = await readFile(join(root, 'docs', 'sourcing-policy.md'), 'utf8');
  assert.ok(doc.includes('[^n]: Title, URL, accessed YYYY-MM-DD'));
  assert.match(doc, /primary/i);
  assert.match(doc, /archive/i);
  assert.match(doc, /\[UNCLEAR\]/);
  assert.match(doc, /draft: true/);
});
