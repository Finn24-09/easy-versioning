# easy-versioning Security Model

## Threat model

The easy-versioning Action runs inside the consuming repository's CI environment
and pushes commits to the repo's default branch under a GitHub App identity. This
section describes what attackers can do, what they can't, and how to harden the
setup.

## What the App can do

Once installed on a repo, the easy-versioning App has these scoped permissions:

| Permission       | Access | Why                                                      |
|------------------|--------|----------------------------------------------------------|
| `metadata`       | read   | Required baseline for every GitHub App.                  |
| `contents`       | write  | Push the bump commit to the default branch.              |
| `pull-requests`  | read   | Read merged PR labels for the skip-release check.        |

The App has no other permissions. It cannot read secrets, modify settings,
manage other Apps, or escalate to repos where it is not installed.

## Secret storage and the key-leak risk

The App's private key must be stored as a secret in every repo (or in an org
secret) where you use easy-versioning, because the Action runs in the
consumer's CI and needs to mint installation tokens.

**Risk:** if a consuming repo is compromised — for example, by a malicious PR
that gets merged and runs in CI with secrets exposed — the attacker can read
the private key and forge installation tokens for every repo where this App is
installed.

**Mitigations:**

1. **Install the App per-repo, never org-wide by default.** The App's blast
   radius is limited to the repos it's actually installed on.
2. **Pin the action to a SHA, not a moving tag.** `uses: <owner>/easy-versioning@<full-40-char-sha>`
   prevents a compromised maintainer from silently shipping malicious code.
3. **Restrict who can update workflows.** GitHub's "require approval for first-time
   contributors" setting and CODEOWNERS for `.github/workflows/` close common
   abuse paths.
4. **Rotate the private key periodically.** From the App settings page,
   regenerate the key, then update the secret in every consuming repo (or just
   the org-level secret if you used one).
5. **Never log the private key or the minted token.** The Action calls
   `core.setSecret()` on the token immediately so any accidental log line is
   masked. We do not log the private key.

## Ruleset bypass: all rules or none

When you add the easy-versioning App as a bypass actor on a ruleset, it bypasses
**every rule** in that ruleset for its pushes — not just "no direct push". This
includes required status checks, required reviews, and required deployments.

This is GitHub's actual behavior; we cannot change it.

**If you need stricter behavior:** split your rulesets so the bypass-eligible
ruleset only contains the rule you want to bypass (e.g., "no direct push"), and
put your other requirements (status checks, reviews) in a separate ruleset that
the App is *not* allowed to bypass. The bump push will fail the second ruleset's
requirements, so this only works if the App's commits should still go through
status checks. (Most teams find the "all bypassed" model acceptable for an
auto-versioning bot whose commits only modify `package.json`.)

## What the Action does NOT do

- Does not read your source code beyond what's needed to compute changed files.
- Does not exfiltrate any data — no network calls except to GitHub's API.
- Does not depend on any third-party service.
- Does not write to any path other than the configured packages' `package.json`
  files.

## Reporting vulnerabilities

If you discover a security issue in easy-versioning, please open a private security
advisory at `https://github.com/<owner>/easy-versioning/security/advisories/new`
rather than a public issue.
