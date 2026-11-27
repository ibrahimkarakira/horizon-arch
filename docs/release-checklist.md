# Release checklist

Copy the "Before the PR" list into the release PR and tick each line only with its evidence in the PR body. The release PR is merged and tagged by a maintainer.

Versions follow Semantic Versioning (0.y.z while the project is in initial development); the changelog follows Keep a Changelog 1.1.0.

## Before the PR

- [ ] `package.json` and `package-lock.json` carry the new version (`npm version <x.y.z> --no-git-tag-version`; no tag is created).
- [ ] `CHANGELOG.md`: the `Unreleased` entries are moved under `## [x.y.z] - YYYY-MM-DD`, `Unreleased` stays empty above it, and a `[x.y.z]:` link points at the release tag.
- [ ] `CITATION.cff`: `version` and `date-released` match the changelog heading.
- [ ] `tests/release.test.mjs` passes (it fails when those four files disagree).
- [ ] Release notes drafted in `docs/releases/vx.y.z.md`: what is in it, how to try it, what is not in it.
- [ ] Clean clone on Windows: `npm ci` and `npm run check` both exit 0.
- [ ] Clean clone in Docker `node:22`: `npm ci && npm run check` exits 0 (install the lychee release binary first, see `docs/link-policy.md`).
- [ ] `npm run preview` serves the site; screenshots of the release's headline pages are in the PR.
- [ ] Every claim in the release notes is backed by a command output or a source; anything else is marked `[UNCLEAR]` or removed.

## After the PR (maintainer)

1. If merging on a later day than the changelog date, update the date in `CHANGELOG.md` and `CITATION.cff` on the PR branch and push.
2. Merge the PR (rebase).
3. Tag and push: `git switch main && git pull --ff-only && git tag -a vx.y.z -m "vx.y.z" && git push origin vx.y.z`.
4. Create the GitHub Release from that tag, so `gh` does not create a tag of its own: `gh release create vx.y.z --verify-tag --title "vx.y.z" --notes-file docs/releases/vx.y.z.md`.
