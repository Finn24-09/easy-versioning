# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A GitHub Action (`runs.using: node20`, entrypoint `dist/index.js`) that auto-bumps `package.json` versions on PR-merge pushes using CalVer (`YY.M.D`, with `-N` suffix on same-day collisions). It authenticates as a GitHub App, mints a short-lived installation token at runtime, and creates the bump commit via GitHub's GraphQL `createCommitOnBranch` so the commit shows up as **Verified** and attributed to the App's bot identity. There is no webhook server and no long-lived PAT.

Consumer-facing docs live in `README.md`, `docs/installation.md`, `docs/security.md`. `examples/workflow.yml` and `examples/easy-versioning.yml` are the canonical consumer setup.

## Commands

Package manager is **pnpm 9.15.9** (pinned via `packageManager` field) and Node **>=20** (`.nvmrc`).

| Task | Command |
| --- | --- |
| Install | `pnpm install --frozen-lockfile` |
| Run everything CI runs | `pnpm run all` (lint + format:check + typecheck + test + build) |
| Lint | `pnpm run lint` |
| Format check / fix | `pnpm run format:check` / `pnpm run format` |
| Typecheck only | `pnpm run typecheck` |
| Test (all) | `pnpm run test` |
| Test (single file) | `pnpm exec jest tests/version.test.ts` |
| Test (single test name) | `pnpm exec jest -t "bumps the matched package"` |
| Watch tests | `pnpm run test:watch` |
| Build the action bundle | `pnpm run build` (writes to `dist/`) |

### `dist/` is committed and CI enforces it

The action's entrypoint is the precompiled bundle `dist/index.js` produced by `@vercel/ncc`. CI's last step (`.github/workflows/ci.yml`) runs `pnpm run build` and **fails the build if `dist/` has uncommitted changes**. Any time you edit anything under `src/`, run `pnpm run build` and commit the regenerated `dist/` along with the source change. `dist/*` is marked `linguist-generated` so it collapses in PR diffs.

`.gitattributes` forces `eol=lf` repo-wide so the bundled output is byte-stable between Windows local dev and Linux CI — do not let your editor convert to CRLF.

## Architecture

### Entrypoint chain

`src/index.ts` (one-liner) → `src/main.ts::run()` (real I/O wiring) → `src/main.ts::runWithEffects(eff)` (pure orchestration).

The split exists because `runWithEffects` takes a `MainEffects` interface containing every side-effect (`readFile`, `writeFile`, `mintToken`, `createSignedCommit`, `getLabels`, `now`, `log`, ...). All tests in `tests/main.test.ts` exercise `runWithEffects` with fake effects; only the thin `run()` wrapper does real Octokit / fs / `@actions/*` work and is excluded from coverage via `/* istanbul ignore next */`. When adding a new side-effect, add it to the `MainEffects` interface and wire it up in both `run()` and the test's `makeEffects()` helper — do not call Octokit, `fs`, `@actions/core`, or `@actions/exec` directly from `runWithEffects` or any module it calls.

### Module map

| File | Role |
| --- | --- |
| `src/inputs.ts` | Parses the three action inputs (`app-id`, `private-key`, `config-path`). |
| `src/config.ts` | Loads `.github/easy-versioning.yml` (or `DEFAULT_CONFIG` if missing) and validates shape. |
| `src/changedFiles.ts` | Runs `git diff` to compute changed files; uses `HEAD^1` for merge commits and `HEAD~N` otherwise (`detectMergeParent` decides which). |
| `src/packageMatcher.ts` | Applies the global `ignore` globs, then matches each package's `triggers` against remaining changed files (minimatch with `dot: true`). |
| `src/packageJson.ts` | `readVersion` / `writeVersion` — preserves formatting (indentation, trailing newline). |
| `src/version.ts` | CalVer logic: `formatToday(now, tz)` → `YY.M.D` via `Intl.DateTimeFormat`; `computeNextVersion(current, today)` returns `today`, `today-N`, or throws if `current` is dated in the future. |
| `src/githubApp.ts` | `mintInstallationToken` — uses `@octokit/auth-app` to fetch installation ID, then mints a short-lived token. |
| `src/githubApi.ts` | `getLabelsForCommit` — finds the merged PR for `sha` and returns its labels (for the `skip-release` check). |
| `src/githubRef.ts` | `getBranchHeadOid` / `getFileContents` — used during retry to re-read remote state. |
| `src/githubCommit.ts` | `createSignedCommit` — GraphQL `createCommitOnBranch` mutation. Detects stale-head errors heuristically and throws `CommitConflictError` so `main.ts` can retry. |
| `src/types.ts` | Shared `EasyVersioningConfig` / `PackageConfig` types. |

### Commit flow and conflict retry

`runWithEffects` does up to `MAX_COMMIT_ATTEMPTS = 4` passes:

1. Read each target `package.json` from the local checkout, compute next version, write locally, attempt `createSignedCommit` with `expectedHeadOid = ctx.sha`.
2. On `CommitConflictError`, re-fetch `branch.head.oid`, re-read every target `package.json` from that ref via the GraphQL API (not local fs — local is stale), recompute, retry.

The local `writeFile` during retry is best-effort sync; the actual commit always uses the in-memory `contents` from the most recent re-read. Anything you add to the bump must flow through this `PendingUpdate` shape.

### Why GraphQL and not `git push`

Server-side commits via `createCommitOnBranch` are GPG-signed by GitHub on the App's behalf — no signing key to manage. The Action **never** runs `git config user.name`, `git commit`, or `git push` for the bump. Don't add a `git push` fallback; the App identity / Verified status / ruleset-bypass semantics all depend on this path.

### Testing seams

- ESM-only deps (`@octokit/rest`, `@octokit/graphql`) are mocked via `jest.config.js::moduleNameMapper` pointing at `tests/__mocks__/@octokit/*.ts`.
- `@octokit/auth-app` is mocked inline in test files that touch `githubApp.ts` (`jest.mock('@octokit/auth-app', ...)`).
- `createSignedCommit` and `mintInstallationToken` accept hidden `__graphqlClient` / `__octokitFactory` parameters as test seams — prefer these over module-level mocks for unit tests of those modules.

### Coverage threshold

`jest.config.js` enforces 80% branches/functions/lines/statements globally; `src/index.ts` is excluded from coverage. Don't drop this without a reason.

## Release flow

Tags `v<major>.<minor>.<patch>` on `main` trigger `.github/workflows/release.yml`, which force-pushes the matching `v<major>` floating tag to that commit. Consumers pin to `@v1` (or pin to a full SHA for supply-chain hardening, as recommended in `docs/security.md`). The `release.yml` workflow can also be run manually with a `source-tag` input.
