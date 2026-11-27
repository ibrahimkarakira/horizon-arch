// One command for the whole local suite: `npm run check`.
// Runs each step in order, stops at the first failure and exits with its code.
// Later tasks append their steps to STEPS.
import { spawnSync } from 'node:child_process';

const STEPS = [
  ['lint', 'npm run lint'],
  ['build', 'npm run build'],
  ['test', 'npm test'], // reads dist/, so it runs after build
  ['validate', 'npm run validate'], // every file in predictions/
  ['sources', 'npm run check:sources'], // alt text in dist/, citations in src/content/docs/
  ['links', 'npm run check:links'], // internal links in dist/, offline (source URLs are a separate manual command, see docs/link-policy.md)
];

for (const [name, command] of STEPS) {
  console.log(`\n== check: ${name} (${command})`);
  // shell: true so `npm` resolves to npm.cmd on Windows and npm on Linux.
  const { status, error } = spawnSync(command, { stdio: 'inherit', shell: true });
  if (status !== 0) {
    console.error(`\n== check: ${name} FAILED (exit ${status ?? 'none'}${error ? `, ${error.message}` : ''})`);
    process.exit(status || 1);
  }
}
console.log('\n== check: all steps passed');
