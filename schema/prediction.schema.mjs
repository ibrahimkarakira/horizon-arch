// The prediction format: one zod schema for the validator, the site and the editor JSON Schema.
// Field reference: templates/prediction.yml. Dates are YYYY-MM-DD strings (the yaml package's
// default schema keeps them as strings), so they compare correctly as plain strings.
import { z } from 'zod';

// How far after `created` the first checkpoint may fall, per horizon. A design choice, change it here.
export const CHECKPOINT_WINDOW_YEARS = { 2030: 2, 2050: 5, 2100: 5 };

export const RESOLVED_STATUSES = ['resolved_true', 'resolved_false', 'ambiguous'];

const text = z.string().trim().min(1);
const date = z.iso.date();

const assumption = z.strictObject({ id: text, statement: text, watch: text });
const source = z.strictObject({ title: text, url: z.url(), accessed: date });
const probability = z.int().min(1).max(99);
const revision = z.strictObject({ date, probability, reason: text });

const predictionId = z.string().regex(/^P(2030|2050|2100)-\d{3}$/, 'id must look like P2030-001');

const predictionObject = z.strictObject({
  id: predictionId,
  title: text,
  claim: text,
  horizon: z.literal([2030, 2050, 2100]),
  // structural: a claim no one alive now will see resolve (all 2100 claims); judged through `proxy`.
  kind: z.enum(['forecast', 'structural']).optional(),
  proxy: text.optional(),
  // Ids that must resolve true for this claim to be scored. The validator checks they exist and form no cycle.
  conditional_on: z.array(predictionId).min(1).optional(),
  resolution_date: date,
  created: date,
  probability,
  probability_basis: text,
  assumptions: z.array(assumption).min(2),
  checkpoint_date: date,
  checkpoint_signal: text,
  resolution_criteria: text,
  resolution_source: text,
  status: z.enum(['open', 'checkpoint_met', 'checkpoint_missed', ...RESOLVED_STATUSES, 'withdrawn']),
  sources: z.array(source).min(1),
  revisions: z.array(revision).optional(),
  tags: z.array(text).optional(),
  resolved_on: date.optional(),
  resolution_note: text.optional(),
});

const addYears = (isoDate, years) => `${Number(isoDate.slice(0, 4)) + years}${isoDate.slice(4)}`;

// Cross-field rules. They are not expressible in JSON Schema, so editors only check field shapes.
export const predictionSchema = predictionObject.superRefine((p, ctx) => {
  const issue = (field, message) => ctx.addIssue({ code: 'custom', path: [field], message });
  const window = CHECKPOINT_WINDOW_YEARS[p.horizon];
  if (p.id.slice(1, 5) !== String(p.horizon)) issue('id', `id ${p.id} must start with P${p.horizon} to match horizon`);
  if (p.checkpoint_date <= p.created) issue('checkpoint_date', 'checkpoint_date must be after created');
  if (p.checkpoint_date > p.resolution_date) issue('checkpoint_date', 'checkpoint_date must not be after resolution_date');
  if (p.checkpoint_date > addYears(p.created, window)) {
    issue('checkpoint_date', `checkpoint_date must be within ${window} years of created for horizon ${p.horizon}`);
  }
  const structural = p.kind === 'structural';
  if (p.horizon === 2100 && !structural) issue('kind', 'horizon 2100 predictions must be kind: structural');
  if (structural && !p.proxy) issue('proxy', 'kind structural requires proxy');
  if (p.conditional_on && !structural) issue('conditional_on', 'conditional_on is allowed only for kind: structural');
  if (RESOLVED_STATUSES.includes(p.status)) {
    if (!p.resolved_on) issue('resolved_on', `status ${p.status} requires resolved_on`);
    if (!p.resolution_note) issue('resolution_note', `status ${p.status} requires resolution_note`);
  }
});

export const predictionJsonSchema = () => ({
  ...z.toJSONSchema(predictionObject, { io: 'input' }),
  $id: 'https://github.com/ibrahimkarakira/horizon-arch/blob/main/schema/prediction.schema.json',
  title: 'horizon-arch prediction',
  description:
    'Field shapes only. Cross-field rules (id matches horizon, checkpoint window, resolution fields, structural kind and proxy) and cross-file rules (conditional_on ids exist, no cycles) are enforced by predictionSchema in schema/prediction.schema.mjs and scripts/validate-predictions.mjs.',
});
