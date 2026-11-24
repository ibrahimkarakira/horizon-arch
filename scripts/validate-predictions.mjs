// Validates prediction files: `node scripts/validate-predictions.mjs [file-or-dir ...]` (default: predictions/).
// Prints `<file>:<line>: error|warning: <field>: <reason>` per finding and a summary line.
// Exit 1 on any error; warnings (vague words in the claim) keep exit 0.
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, extname, join, relative } from 'node:path';
import { LineCounter, isMap, isSeq, parseDocument } from 'yaml';
import { predictionSchema } from '../schema/prediction.schema.mjs';

// Words that make a claim hard to resolve true or false. Extend the list here.
const VAGUE_WORDS = /\b(significant(?:ly)?|substantial(?:ly)?|widespread|mainstream|many|soon|likely)\b/i;

const isYaml = (file) => ['.yml', '.yaml'].includes(extname(file));

// Expands each argument into the YAML files it names; a missing path becomes a finding.
async function collect(args, findings) {
  const files = [];
  for (const arg of args) {
    const info = await stat(arg).catch(() => null);
    if (!info) findings.push({ file: arg, level: 'error', field: 'path', reason: 'no such file or directory' });
    else if (info.isDirectory()) files.push(...(await readdir(arg)).filter(isYaml).sort().map((f) => join(arg, f)));
    else files.push(arg);
  }
  return files;
}

// 1-based line of the deepest node on `path` that exists in the document (the key line for map fields).
function lineOf(doc, lines, path) {
  let node = doc.contents;
  let line = node?.range ? lines.linePos(node.range[0]).line : 1;
  for (const segment of path) {
    if (isMap(node)) {
      const pair = node.items.find((p) => String(p.key?.value ?? p.key) === String(segment));
      if (!pair?.key?.range) break;
      line = lines.linePos(pair.key.range[0]).line;
      node = pair.value;
    } else if (isSeq(node) && node.items[segment]?.range) {
      node = node.items[segment];
      line = lines.linePos(node.range[0]).line;
    } else break;
  }
  return line;
}

async function checkFile(file, seenIds, findings) {
  const lines = new LineCounter();
  const doc = parseDocument(await readFile(file, 'utf8'), { lineCounter: lines });
  const add = (level, path, reason) =>
    findings.push({ file, line: lineOf(doc, lines, path), level, field: path.join('.') || '(document)', reason });

  if (doc.errors.length) {
    for (const e of doc.errors) {
      findings.push({ file, line: e.linePos?.[0].line ?? 1, level: 'error', field: 'yaml', reason: e.message.split('\n')[0] });
    }
    return;
  }
  const data = doc.toJS();
  const result = predictionSchema.safeParse(data);
  for (const issue of result.success ? [] : result.error.issues) {
    if (issue.code === 'unrecognized_keys') issue.keys.forEach((key) => add('error', [...issue.path, key], issue.message));
    else add('error', issue.path, issue.message);
  }

  const id = typeof data?.id === 'string' ? data.id : undefined;
  if (id) {
    const name = basename(file, extname(file));
    if (id !== name) add('error', ['id'], `id ${id} must match the filename ${name}`);
    if (seenIds.has(id)) add('error', ['id'], `duplicate id ${id}, also in ${relative(process.cwd(), seenIds.get(id))}`);
    else seenIds.set(id, file);
  }
  const vague = typeof data?.claim === 'string' && data.claim.match(VAGUE_WORDS);
  if (vague) add('warning', ['claim'], `vague word "${vague[1]}"; state a measurable threshold instead`);
}

async function validate(args) {
  const findings = [];
  const files = await collect(args.length ? args : ['predictions'], findings);
  const seenIds = new Map();
  for (const file of files) await checkFile(file, seenIds, findings);
  return { count: files.length, findings };
}

const { count, findings } = await validate(process.argv.slice(2));
for (const { file, line, level, field, reason } of findings) {
  console.log(`${relative(process.cwd(), file)}${line ? `:${line}` : ''}: ${level}: ${field}: ${reason}`);
}
const errors = findings.filter((f) => f.level === 'error').length;
console.log(`${count} predictions, ${errors} errors, ${findings.length - errors} warnings`);
process.exit(errors ? 1 : 0);
