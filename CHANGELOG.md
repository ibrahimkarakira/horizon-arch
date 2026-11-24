# Changelog

All notable changes to this project are documented here. The format follows Keep a Changelog, and the project uses Semantic Versioning.

## Unreleased

- Starlight site skeleton with a work-in-progress home page, and `npm run check` running lint, build and tests locally (#1).
- Prediction format: zod schema with the checkpoint-window and resolution rules, generated JSON Schema for editors, and `templates/prediction.yml` (#3).
- Prediction validator: `npm run validate` reports schema errors with file and line, duplicate or misnamed ids and vague claim words, and runs in `npm run check` (#9).
- Scoreboard data: `npm run scoreboard` (also run by `prebuild`, after the validator) writes counts by horizon and status, the Brier score with its n, upcoming checkpoints and the prediction changelog to `src/data/` (#10).
- Scoreboard page: an inline SVG status bar per horizon with a text alternative, the Brier score with its n, upcoming checkpoints as a table, and an empty state while no prediction is published (#11).
- Diagram convention: rules for captions, alt text and the palette (`docs/diagram-convention.md`, also a site page), Mermaid blocks rendered in the browser in both themes via `astro-mermaid`, the first hand-authored diagram (`diagrams/layers.svg`, half-lives left blank) and a build that fails on any `<img>` without `alt` (#12).
- Source citations: footnotes as `[^n]: Title, URL, accessed YYYY-MM-DD`, a sourcing policy (`docs/sourcing-policy.md`), essay and page templates with a Sources checked block, and `check-sources` failing a published page with a footnote missing its URL or date, an undefined or unreferenced footnote, or `[UNCLEAR]`; drafts are exempt (#13).
- Model Half-Life framework page v0: the definition, the six layers with their change drivers and how to measure each, a Kaplan-Meier estimation method, a synthetic worked example and a "What this is not" section with nine sources; `diagrams/layers.svg` gains the change-driver and measurement columns, half-lives still blank (#14).
