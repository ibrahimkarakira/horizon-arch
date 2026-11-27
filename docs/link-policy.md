# Link policy

Two link checks, both run by [lychee](https://lychee.cli.rs/) through `scripts/check-links.mjs`, with shared settings in `.lychee.toml`.

| Command | Checks | Network | Part of `npm run check` |
|---|---|---|---|
| `npm run check:links` | every link inside the built site (`dist/`) | no (`--offline`) | yes, the `links` step: a broken internal link fails it |
| `npm run check:links:external` | source URLs in `src/content/docs/` and `predictions/` | yes, with retries and a cache | no |

Install lychee once (it is a single binary): `scoop install lychee` or `winget install lycheeverse.lychee` on Windows, `brew install lychee` on macOS, or a release binary from <https://github.com/lycheeverse/lychee/releases>. In a Linux container such as `node:22`, download the release binary before `npm run check`. Without lychee, the lychee tests in `npm test` are skipped and `npm run check` stops at the `links` step with the install link.

## Internal links

A link between pages, or to an asset, that does not resolve to a file in `dist/` is a bug: fix the link or the page before merging. Absolute links (`/framework/`) resolve against `dist/`, and a directory resolves to its `index.html`. External links are not fetched by this check.

## External source links

The external check is a manual command, `npm run check:links:external`, meant to be run about once a week rather than on every change, because a remote site being down for an hour should not block work. Nothing in this repo schedules it. Transient failures (timeouts, 429, 5xx) are retried three times with backoff; only a 200 after redirects counts as live. URLs checked successfully in the last day are cached in `.lycheecache`. It reads `.md`, `.mdx`, `.yml` and `.yaml` files, so prediction sources are included. The report goes to `reports/links-external.md` (not committed); open one issue for the dead links it lists.

## Fixing a dead source

1. Look for the same document at its new URL and cite that, with a fresh access date.
2. If it is gone, cite an archived copy: put the archive URL in the title, as the [sourcing policy](sourcing-policy.md) describes for fragile URLs, and keep the original URL so the citation still shows where it came from.
3. If no copy exists, remove the claim or mark the page a draft until it has a new source.
