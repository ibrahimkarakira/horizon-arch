# Prediction format

Each prediction is one YAML file in `predictions/`, named after its id: `predictions/P2030-001.yml`.
Start from `templates/prediction.yml` and replace every `<...>` placeholder.

The field rules live in one place, `schema/prediction.schema.mjs`. `schema/prediction.schema.json` is generated from it for editors (`npm run schema:json`) and checks field shapes only.

## Rules the validator enforces

- Every field in the schema: types, required fields, no unknown fields, `probability` an integer from 1 to 99, dates as `YYYY-MM-DD`.
- `id` looks like `P2030-001`, its horizon matches `horizon`, and it equals the filename without `.yml`.
- No two files share an id.
- `checkpoint_date` is after `created`, not after `resolution_date`, and within 2 years of `created` for the 2030 horizon or 5 years for 2050 and 2100.
- `resolved_true`, `resolved_false` and `ambiguous` need `resolved_on` and `resolution_note`.

A claim that uses a vague word (`significant`, `substantial`, `widespread`, `mainstream`, `many`, `soon`, `likely`) gets a warning: name a number or a threshold that a reader can check. Warnings do not fail the run.

## Running it

```sh
npm run validate                                          # every file in predictions/
node scripts/validate-predictions.mjs path/to/file.yml dir/   # specific files or directories
```

Each finding is one line, `<file>:<line>: error|warning: <field>: <reason>`, followed by a summary:

```text
predictions/P2030-002.yml:10: error: probability: Too big: expected number to be <=99
1 predictions, 1 errors, 0 warnings
```

The exit code is 1 if there is any error and 0 otherwise, including when `predictions/` is empty ("0 predictions"). `npm run check` runs the validator as its last step.
