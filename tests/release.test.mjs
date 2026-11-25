import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// The version lives in four files; a release that bumps one and forgets another fails here.
test('package.json, package-lock.json, CITATION.cff and the latest changelog release agree', async () => {
  const { version } = JSON.parse(await read('package.json'));
  const lock = JSON.parse(await read('package-lock.json'));
  const citation = parse(await read('CITATION.cff'));
  const changelog = await read('CHANGELOG.md');

  assert.match(version, /^\d+\.\d+\.\d+$/, 'package.json version is plain SemVer');
  assert.equal(lock.version, version, 'package-lock.json version');
  assert.equal(lock.packages[''].version, version, 'package-lock.json root package version');
  assert.equal(citation.version, version, 'CITATION.cff version');

  const latest = changelog.match(/^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})$/m);
  assert.ok(latest, 'CHANGELOG.md has a "## [x.y.z] - YYYY-MM-DD" release heading');
  assert.equal(latest[1], version, 'latest CHANGELOG.md release');
  assert.equal(citation['date-released'], latest[2], 'CITATION.cff date-released matches the changelog date');
  assert.ok(changelog.indexOf('## Unreleased') < latest.index, 'Unreleased stays above the latest release');
});

test('CITATION.cff carries the fields CFF 1.2.0 requires', async () => {
  const citation = parse(await read('CITATION.cff'));
  assert.equal(citation['cff-version'], '1.2.0');
  for (const key of ['message', 'title', 'authors']) assert.ok(citation[key], `CITATION.cff ${key}`);
  assert.ok(citation.authors.length > 0, 'at least one author');
});
