# Changelog

All notable changes to this project are documented here. The format follows Keep a Changelog, and the project uses Semantic Versioning.

## Unreleased

- Starlight site skeleton with a work-in-progress home page, and `npm run check` running lint, build and tests locally (#1).
- Prediction format: zod schema with the checkpoint-window and resolution rules, generated JSON Schema for editors, and `templates/prediction.yml` (#3).
- Prediction validator: `npm run validate` reports schema errors with file and line, duplicate or misnamed ids and vague claim words, and runs in `npm run check` (#9).
