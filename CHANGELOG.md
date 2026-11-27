# Changelog

All notable changes to this project are documented here. The format follows Keep a Changelog, and the project uses Semantic Versioning.

## Unreleased

- Link checks with lychee: `npm run check` fails on a broken internal link in the built site, `npm run check:links:external` reports dead source URLs (Markdown and `.yml` predictions) with retries and a cache, run by hand about weekly (`docs/link-policy.md`), and the site gets the favicon its pages already linked to (#24).

## [0.1.0] - 2026-11-27

First tagged release: the site builds and previews locally, the prediction format is checked, and the Model Half-Life framework page has its first dataset. No prediction is published yet. Roadmap tasks D01 to D10.

### Added

- Release v0.1.0: version 0.1.0, `CITATION.cff`, `docs/release-checklist.md`, release notes in `docs/releases/v0.1.0.md`, and a test that fails when the version in `package.json`, `package-lock.json`, `CITATION.cff` and this changelog disagree (#16).
- Starlight site skeleton with a work-in-progress home page, and `npm run check` running lint, build and tests locally (#1).
- Prediction format: zod schema with the checkpoint-window and resolution rules, generated JSON Schema for editors, and `templates/prediction.yml` (#3).
- Prediction validator: `npm run validate` reports schema errors with file and line, duplicate or misnamed ids and vague claim words, and runs in `npm run check` (#9).
- Scoreboard data: `npm run scoreboard` (also run by `prebuild`, after the validator) writes counts by horizon and status, the Brier score with its n, upcoming checkpoints and the prediction changelog to `src/data/` (#10).
- Scoreboard page: an inline SVG status bar per horizon with a text alternative, the Brier score with its n, upcoming checkpoints as a table, and an empty state while no prediction is published (#11).
- Diagram convention: rules for captions, alt text and the palette (`docs/diagram-convention.md`, also a site page), Mermaid blocks rendered in the browser in both themes via `astro-mermaid`, the first hand-authored diagram (`diagrams/layers.svg`, half-lives left blank) and a build that fails on any `<img>` without `alt` (#12).
- Source citations: footnotes as `[^n]: Title, URL, accessed YYYY-MM-DD`, a sourcing policy (`docs/sourcing-policy.md`), essay and page templates with a Sources checked block, and `check-sources` failing a published page with a footnote missing its URL or date, an undefined or unreferenced footnote, or `[UNCLEAR]`; drafts are exempt (#13).
- Model Half-Life framework page v0: the definition, the six layers with their change drivers and how to measure each, a Kaplan-Meier estimation method, a synthetic worked example and a "What this is not" section with nine sources; `diagrams/layers.svg` gains the change-driver and measurement columns, half-lives still blank (#14).
- Model lifetimes: `data/model-lifetimes.csv` with 112 model versions from the Anthropic, OpenAI and Google deprecation pages, with the dates those pages lack taken from each vendor's release notes or launch posts (source URL and access date for every source on every row), `scripts/model-halflife.mjs` printing n, the median days from release to deprecation notice and the excluded rows by reason, and a page with the method and limits: n = 76, median 302.5 days (#15).

[0.1.0]: https://github.com/ibrahimkarakira/horizon-arch/releases/tag/v0.1.0
