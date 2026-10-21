# Releasing

Releases are published from GitHub Actions
([.github/workflows/release.yml](.github/workflows/release.yml)) with npm
trusted publishing: the workflow signs in to npm with a short-lived OIDC
token, so there is no npm token in the repository and no one-time password
to type, and every version gets a
[provenance statement](https://docs.npmjs.com/generating-provenance-statements)
linking it to the commit and workflow run that built it.

## Shipping a version

1. On a branch, bump the version in `package.json`, `package-lock.json`
   (`npm version --no-git-tag-version X.Y.Z` does both) and
   `src/version.js` (`npm test` fails until they match).
2. Write the release notes in `docs/release-notes/vX.Y.Z.md`, in the format
   of the earlier releases: one bullet per change with the issue or PR
   number, "Behavior change" for changed options, defaults or exports
   ([docs/stability.md](docs/stability.md)), and the corpus suites that were
   checked. The workflow adds the closing `npm: warpdom@X.Y.Z` line unless
   the file has one. Without the file the release gets GitHub's generated
   notes.
3. Merge to main and wait for CI.
4. Tag the release commit on main (the merge of step 3) and push the tag:

   ```sh
   git switch main && git pull
   git tag vX.Y.Z <commit>
   git push origin vX.Y.Z
   ```

The workflow then:

- checks that the tag is `v` + the `package.json` version, that
  `src/version.js` matches and that the tagged commit is on main;
- runs `npm ci`, `npm test` and `npm run test:types` on Node 24, and packs
  the three packages (`npm pack`);
- in a separate job that installs nothing from the project (the only job
  that can get an npm token), publishes the packed `warpdom`, plus
  `vitest-environment-warpdom` and `jest-environment-warpdom` when the
  version in their `packages/*/package.json` is not on npm yet (bump one of
  those only when it changed), with `npm publish --provenance --access
  public`;
- creates the GitHub release `warpdom X.Y.Z` from the tag (Zenodo archives
  it and mints a version DOI).

Release runs never overlap: a run started while another is in progress
waits for it (up to 100 waiting runs).

Afterwards, smoke-test the package from the registry in a fresh project.

**Dry run:** Actions, "release", "Run workflow", with "Dry run" ticked (the
default), on any branch or tag: runs the checks and tests, packs and lists
each package's files, runs `npm publish --dry-run` for each version not on
npm yet (npm refuses it for a version that is), prints the release notes,
and publishes nothing.

**A failed release:** fix the cause and run the workflow from the tag with
"Dry run" unticked; versions already on npm are skipped and an existing
GitHub release is left as is. Never move a tag that npm has published. In
staged mode, first approve (or reject) on npmjs.com what the failed run
staged: a staged version is not visible to the workflow's `npm view`
check, and npm refuses to stage the same version again.

**Staged publishing:** set the repository variable `NPM_PUBLISH_MODE` to
`stage` (Settings, Secrets and variables, Actions, Variables) and the
workflow runs `npm stage publish` instead: each package waits on npmjs.com
(Staged Packages) until a maintainer approves it with 2FA, or
`npm stage approve <id>`. The GitHub release is then created as a draft;
publish it after the approval (the release's Edit, "Publish release", or
`gh release edit vX.Y.Z --draft=false`).

## One-time setup on npmjs.com

For each of the three packages (`warpdom`, `vitest-environment-warpdom`,
`jest-environment-warpdom`):

1. npmjs.com, the package, **Settings**, **Trusted Publisher**, choose
   **GitHub Actions**.
2. Organization or user `sonukapoor`, repository `warpdom`, workflow
   filename `release.yml`, environment empty. Fields are case-sensitive and
   npm does not check them when saving; a mistake shows up as an
   authentication error (ENEEDAUTH) at publish time.
3. Allowed actions: tick **npm publish** for direct publishing (otherwise
   only `npm stage publish` is allowed; then set `NPM_PUBLISH_MODE` to
   `stage`, above).

A new trusted publisher must complete a publish within 2 days or it expires
and has to be created again, so set it up shortly before the next release
(or recreate it). Once a release has gone through, npm recommends
**Settings**, **Publishing access**, "Require two-factor authentication and
disallow tokens" for each package: trusted publishing keeps working, and
classic tokens can no longer publish.

Requirements the workflow already meets: a GitHub-hosted runner, the
`id-token: write` permission, npm 11.5.1 or later (it installs 11.21.0) and
`repository.url` in each `package.json` matching
`https://github.com/sonukapoor/warpdom`.

## Publishing by hand

If the workflow cannot publish, a maintainer can still run
`npm publish --access public` from a clean checkout of the tag (2FA
one-time password; no provenance). Create the GitHub release afterwards
(`gh release create vX.Y.Z --title "warpdom X.Y.Z" -F docs/release-notes/vX.Y.Z.md`).
