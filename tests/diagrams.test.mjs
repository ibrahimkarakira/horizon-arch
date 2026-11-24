import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { imagesWithoutAlt } from '../scripts/check-sources.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (...parts) => readFile(join(root, ...parts), 'utf8');

test('imagesWithoutAlt flags an <img> with no alt attribute, and only that one', () => {
  const html = '<img src="a.svg" alt="Layers"><IMG SRC="b.png"><img alt="" src="c.png"><img src="d.png" data-alt="x">';
  assert.deepEqual(imagesWithoutAlt(html), ['<IMG SRC="b.png">', '<img src="d.png" data-alt="x">']);
});

test('check-sources exits 1 and names the file when a built page has an <img> without alt', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'horizon-alt-'));
  await mkdir(join(dir, 'page'));
  await writeFile(join(dir, 'page', 'index.html'), '<p><img src="x.svg"></p>');
  await writeFile(join(dir, 'ok.html'), '<img src="y.svg" alt="ok">');
  const { status, stdout, stderr } = spawnSync(process.execPath, ['scripts/check-sources.mjs', dir], { cwd: root, encoding: 'utf8' });
  assert.equal(status, 1, stdout + stderr);
  assert.match(stderr, /page[\\/]index\.html: <img> without alt: <img src="x\.svg">/);
  assert.doesNotMatch(stderr, /ok\.html/);
});

test('layers.svg is labelled: role, title, desc and aria-labelledby', async () => {
  const svg = await read('diagrams', 'layers.svg');
  assert.match(svg, /<svg[^>]*role="img"/);
  assert.match(svg, /<svg[^>]*aria-labelledby="layers-title layers-desc"/);
  assert.match(svg, /<title id="layers-title">[^<]+<\/title>/);
  assert.match(svg, /<desc id="layers-desc">[^<]+<\/desc>/);
});

// Palette values live once, in src/styles/diagrams.css; the convention page must list every one.
const palette = async () => {
  const css = await read('src', 'styles', 'diagrams.css');
  const block = (selector) => {
    const body = css.slice(css.indexOf(selector)).match(/\{([^}]*)\}/)[1];
    return Object.fromEntries([...body.matchAll(/(--ha-[\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2].toLowerCase()]));
  };
  return { dark: block(':root {'), light: block(":root[data-theme='light']") };
};

// WCAG 2 relative luminance and contrast ratio.
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('palette: 4 neutrals and 2 accents per theme, each at least 4.5:1 against both backgrounds', async () => {
  for (const [theme, colours] of Object.entries(await palette())) {
    assert.deepEqual(Object.keys(colours).sort(), ['--ha-fill', '--ha-ink', '--ha-line', '--ha-long', '--ha-short', '--ha-surface'], theme);
    for (const name of ['--ha-ink', '--ha-line', '--ha-short', '--ha-long']) {
      for (const bg of ['--ha-surface', '--ha-fill']) {
        const ratio = contrast(colours[name], colours[bg]);
        assert.ok(ratio >= 4.5, `${theme} ${name} on ${bg}: ${ratio.toFixed(2)}:1`);
      }
    }
  }
});

test('the convention lists every palette value and the caption rule', async () => {
  const doc = await read('docs', 'diagram-convention.md');
  for (const colours of Object.values(await palette())) {
    for (const [name, hex] of Object.entries(colours)) assert.ok(doc.includes(`\`${name}\``) && doc.toLowerCase().includes(hex), `${name} ${hex}`);
  }
  assert.match(doc, /## Caption/);
});

// Reads the built site, so `npm run build` must run first (scripts/check.mjs does that).
test('built layers page inlines the labelled SVG with a caption', async () => {
  const html = await read('dist', 'framework', 'layers', 'index.html');
  assert.match(html, /<figure[^>]*>\s*<svg[^>]*role="img"/);
  assert.match(html, /<title id="layers-title">/);
  assert.match(html, /<figcaption>[^<]+/);
});

test('built convention page carries a Mermaid block for client-side rendering', async () => {
  const html = await read('dist', 'reference', 'diagram-convention', 'index.html');
  assert.match(html, /<pre class="mermaid"[^>]*>\s*flowchart/);
  assert.match(html, /Caption/);
});
