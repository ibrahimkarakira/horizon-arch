// Writes schema/prediction.schema.json from the zod schema (zod 4's built-in z.toJSONSchema).
// tests/schema.test.mjs fails if the committed file drifts from the zod schema.
import { writeFile } from 'node:fs/promises';
import { predictionJsonSchema } from '../schema/prediction.schema.mjs';

const out = new URL('../schema/prediction.schema.json', import.meta.url);
await writeFile(out, `${JSON.stringify(predictionJsonSchema(), null, 2)}\n`);
console.log(`wrote ${out.pathname}`);
