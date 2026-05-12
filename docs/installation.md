# 📖 Installing easy-versioning

This guide covers the **one-time setup** required for an organization plus the **per-repo steps** to enable easy-versioning.

---

## ✅ Prerequisites

- 🏢 A GitHub organization (or personal account) where you want to use easy-versioning.
- 🔑 Admin access to that org (or your account) so you can register a GitHub App.
- 🛠️ Admin access to each repo where you want to enable bumping (to set up secrets, the workflow, and rulesets).

---

## 🏗️ One-time: register the GitHub App

> [!NOTE]
> You only do this **once per organization**.

### 1. Create the App

Go to **Settings → Developer settings → GitHub Apps → New GitHub App**, OR use the App Manifest flow at the URL below to pre-fill the form:

```
https://github.com/organizations/<YOUR_ORG>/settings/apps/new?manifest=<URL-encoded JSON of docs/app-manifest.json>
```

### 2. Pick a name

Set the App name to something like `easy-versioning-<ORG>` (must be unique on GitHub).

> [!TIP]
> This name becomes the slug of the App's bot identity — bump commits are attributed to `<your-slug>[bot]` (e.g. `easy-versioning-myorg[bot]`) with its avatar and a clickable link to the bot account. The slug only affects display; the Action behaviour is identical regardless of the name you pick.

### 3. Disable webhooks

🚫 **Webhooks: disabled.** This App does not receive events.

### 4. Set permissions (must match exactly)

| Scope | Permission | Access |
| --- | --- | --- |
| 📦 Repository | Contents | **Read and write** |
| 📦 Repository | Metadata | **Read** (auto-set) |
| 📦 Repository | Pull requests | **Read** |
| 🏢 Organization | — | **none** |
| 👤 Account | — | **none** |

### 5. Restrict installation scope

**Where can this GitHub App be installed?** → **Only on this account** (recommended). Public installations make sense only if you intend to share the App across orgs.

### 6. After creating

Open the App's settings page and:

- 📋 Copy the **App ID** (numeric).
- 🔐 Click **Generate a private key**, download the `.pem` file.
- 📥 Click **Install App** in the left sidebar and install it on the repos where you want bumping.

> [!WARNING]
> Use **"Only select repositories"**, not **"All repositories"**, unless you want to opt every repo in by default. See [security.md](security.md) for the blast-radius reasoning.

---

## 🔧 Per-repo setup

Repeat for each repo where you want bumping enabled.

### 1️⃣ Add secrets

In the repo (or in the org, scoped to this repo):

| Secret | Value |
| --- | --- |
| `EASY_VERSIONING_APP_ID` | The App ID from above. |
| `EASY_VERSIONING_PRIVATE_KEY` | The contents of the `.pem` file (entire file, including the `BEGIN`/`END` lines). |

> [!TIP]
> Org-level secrets are recommended for organizations that use easy-versioning on many repos — it centralizes management and key rotation.

### 2️⃣ Add the workflow file

Copy `examples/workflow.yml` to `.github/workflows/easy-versioning.yml`.

The example pins `Finn24-09/easy-versioning@v1` — the floating major-version tag, which receives non-breaking patch and minor updates within the v1 line.

> [!IMPORTANT]
> For **maximum supply-chain hardening**, pin to a full 40-character commit SHA instead: `Finn24-09/easy-versioning@<sha>` (see GitHub's [hardening guide for third-party actions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions#using-third-party-actions)).

### 3️⃣ Add the config file *(optional but recommended)*

Copy `examples/easy-versioning.yml` to `.github/easy-versioning.yml` and edit the `packages` and `ignore` sections to match your repo.

> [!NOTE]
> If you skip this, easy-versioning bumps the **root `package.json`** on every push.

### 4️⃣ Configure ruleset bypass *(if applicable)*

If your default branch is protected by a branch protection rule or a ruleset that blocks direct pushes:

- 🪦 **Branch protection rule** (legacy): add the easy-versioning App as an allowed actor under "Restrict who can push to matching branches".
- 🆕 **Ruleset** (modern): edit the ruleset, scroll to **Bypass list**, click **Add bypass**, select the easy-versioning App, choose **Always** as the bypass mode.

> [!WARNING]
> **Ruleset bypass is all-rules-or-nothing.** The App will bypass *every* rule in that ruleset for its pushes — required reviews, required status checks, required deployments, all of it. If you want different rules to apply, split your ruleset (see [`security.md`](security.md)).

### 5️⃣ Test it

- 📝 Open a small PR.
- ✅ Merge it.
- 👀 Watch the `easy-versioning` workflow run on the Actions tab.
- 🚀 The bump commit should land on your default branch within ~30 seconds.

---

## 🔄 Updating

To update easy-versioning, change the `@v1` (or pinned SHA) in your workflow file to the new version.

> [!CAUTION]
> Major version bumps may include breaking changes — check the release notes before upgrading.
