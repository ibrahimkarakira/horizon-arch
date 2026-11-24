# Sourcing policy

Every factual claim on a published page cites a source a reader can open. Opinions, predictions and definitions do not need one; numbers, dates, quotes and "X does Y" statements about the world do.

## Footnote format

Cite with a GitHub-Flavored Markdown footnote, which Astro renders by default in `.md` and `.mdx` pages:

```md
Context windows grew tenfold in that period.[^1]

[^1]: Title, URL, accessed YYYY-MM-DD
```

Each definition is one line, `[^n]: Title, URL, accessed YYYY-MM-DD`. The label `n` may be a number or a word. The access date is the day you last opened the source and checked that it still says what the page claims.

Put the definitions under a `## Sources checked` heading at the end of the page. `templates/essay.mdx` and `templates/page.mdx` start you there.

## Which sources

- **Primary over secondary.** Cite the paper, the spec, the release notes or the dataset, not an article about it. Use a secondary source only when no primary one is public, and say so in the title.
- **Archive fragile URLs.** For a page likely to change or vanish (news, vendor pricing, model cards, leaderboards, social posts), add an archive link inside the title: `Title (archived https://web.archive.org/...), URL, accessed YYYY-MM-DD`.
- **Public sources only.** Nothing private, proprietary or confidential, and no material whose licence forbids quoting.

## Unverified claims

`[UNCLEAR]` marks a claim not yet backed by a source or a measurement. It is allowed only in drafts (frontmatter `draft: true`, which Starlight leaves out of production builds) and banned on published pages: source the claim or delete it before publishing.

## What the linter checks

`node scripts/check-sources.mjs` runs after every build and as the `sources` step of `npm run check`. It scans `src/content/docs/**` (`.md` and `.mdx`) and fails, naming file and line, when:

- a footnote definition has no URL, no access date, or an access date that is not a real day;
- a footnote reference `[^n]` has no definition;
- a definition is never referenced;
- `[UNCLEAR]` appears on a page that is not a draft.

Drafts are skipped entirely. Text inside code spans and fenced code blocks is ignored, so a page can show the syntax.
