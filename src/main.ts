import * as path from 'path';
import { parseInputs } from './inputs';
import { parseConfig } from './config';
import { detectChangedFiles, detectMergeParent } from './changedFiles';
import { selectPackagesToBump } from './packageMatcher';
import { readVersion, writeVersion } from './packageJson';
import { computeNextVersion, formatToday } from './version';
import { mintInstallationToken } from './githubApp';
import { getLabelsForCommit } from './githubApi';
import { configureGitIdentity, commitAndPush } from './git';
import { Octokit } from '@octokit/rest';
import * as core from '@actions/core';
import * as actionsExec from '@actions/exec';
import * as github from '@actions/github';
import * as fs from 'fs/promises';

export interface MainContext {
  owner: string;
  repo: string;
  branch: string;
  sha: string;
  commitCount: number;
}

export interface MainEffects {
  getInput: (k: string) => string | undefined;
  getContext: () => MainContext;
  readFile: (p: string) => Promise<string>;
  writeFile: (p: string, content: string) => Promise<void>;
  detectChangedFiles: (commitCount: number, mergeParent: boolean) => Promise<string[]>;
  detectMergeParent: () => Promise<boolean>;
  mintToken: (appId: number, key: string, owner: string, repo: string) => Promise<string>;
  getLabels: (token: string, owner: string, repo: string, sha: string) => Promise<string[]>;
  configureIdentity: (appId: number) => Promise<void>;
  commitAndPush: (
    files: string[],
    message: string,
    remoteUrl: string,
    branch: string,
    onRetry: () => Promise<void>
  ) => Promise<void>;
  now: () => Date;
  setSecret: (s: string) => void;
  log: (msg: string) => void;
}

function isENOENT(err: unknown): boolean {
  return (err as { code?: string })?.code === 'ENOENT';
}

export async function runWithEffects(eff: MainEffects): Promise<void> {
  const inputs = parseInputs({
    'app-id': eff.getInput('app-id'),
    'private-key': eff.getInput('private-key'),
    'config-path': eff.getInput('config-path'),
  });

  const ctx = eff.getContext();

  let configContent: string | undefined;
  try {
    configContent = await eff.readFile(inputs.configPath);
  } catch (err) {
    if (!isENOENT(err)) throw err;
    configContent = undefined;
    eff.log(`no ${inputs.configPath} found; using default config`);
  }
  const config = parseConfig(configContent);

  const token = await eff.mintToken(inputs.appId, inputs.privateKey, ctx.owner, ctx.repo);
  eff.setSecret(token);

  const labels = await eff.getLabels(token, ctx.owner, ctx.repo, ctx.sha);
  if (labels.includes(config.skipLabel)) {
    eff.log(`merged PR has '${config.skipLabel}' label; skipping bump`);
    return;
  }

  const mergeParent = await eff.detectMergeParent();
  const changed = await eff.detectChangedFiles(ctx.commitCount, mergeParent);
  eff.log(`changed files: ${changed.length} (mergeParent=${mergeParent})`);

  const toBump = selectPackagesToBump(changed, config);
  if (toBump.length === 0) {
    eff.log('no packages match changed files; nothing to bump');
    return;
  }

  const today = formatToday(eff.now(), config.timezone);
  const updates: Array<{ pkgPath: string; manifestPath: string; from: string | undefined; to: string }> = [];

  for (const pkg of toBump) {
    const manifestPath = path.posix.join(pkg.path, 'package.json');
    let manifestContent: string;
    try {
      manifestContent = await eff.readFile(manifestPath);
    } catch (err) {
      if (isENOENT(err)) {
        throw new Error(`config references package at '${pkg.path}' but ${manifestPath} does not exist`);
      }
      throw err;
    }
    const current = readVersion(manifestContent);
    const next = computeNextVersion(current, today);
    const updated = writeVersion(manifestContent, next);
    await eff.writeFile(manifestPath, updated);
    updates.push({ pkgPath: pkg.path, manifestPath, from: current, to: next });
  }

  await eff.configureIdentity(inputs.appId);
  const message = formatCommitMessage(updates);
  const remoteUrl = `https://x-access-token:${token}@github.com/${ctx.owner}/${ctx.repo}.git`;

  await eff.commitAndPush(
    updates.map((u) => u.manifestPath),
    message,
    remoteUrl,
    ctx.branch,
    async () => {
      for (const u of updates) {
        const fresh = await eff.readFile(u.manifestPath);
        const cur = readVersion(fresh);
        const next = computeNextVersion(cur, today);
        const out = writeVersion(fresh, next);
        await eff.writeFile(u.manifestPath, out);
        u.from = cur;
        u.to = next;
      }
    }
  );

  eff.log(
    `bumped ${updates.length} package(s):\n` +
      updates.map((u) => `  ${u.pkgPath}: ${u.from ?? '(none)'} -> ${u.to}`).join('\n')
  );
}

function formatCommitMessage(updates: Array<{ pkgPath: string; from: string | undefined; to: string }>): string {
  const body = updates.map((u) => `- ${u.pkgPath}: ${u.from ?? '(none)'} -> ${u.to}`).join('\n');
  return `chore(release): bump versions [skip ci]\n\n${body}`;
}

/* istanbul ignore next: pure dependency-injection wiring; runWithEffects is the testable seam */
export async function run(): Promise<void> {
  try {
    const exec = async (cmd: string, args: string[]) => {
      let stdout = '';
      const exitCode = await actionsExec.exec(cmd, args, {
        listeners: { stdout: (d) => (stdout += d.toString()) },
        ignoreReturnCode: true,
      });
      return { stdout, exitCode };
    };

    const eff: MainEffects = {
      getInput: (k) => core.getInput(k) || undefined,
      getContext: () => {
        const ctx = github.context;
        const headCommit = (ctx.payload as { head_commit?: { id?: string } }).head_commit;
        const sha = headCommit?.id ?? ctx.sha;
        const commits = (ctx.payload as { commits?: unknown[] }).commits ?? [];
        return {
          owner: ctx.repo.owner,
          repo: ctx.repo.repo,
          branch: ctx.ref.replace('refs/heads/', ''),
          sha,
          commitCount: Math.max(commits.length, 1),
        };
      },
      readFile: (p) => fs.readFile(p, 'utf8'),
      writeFile: (p, c) => fs.writeFile(p, c, 'utf8'),
      detectChangedFiles: (n, m) => detectChangedFiles({ commitCount: n, mergeParent: m, exec }),
      detectMergeParent: () => detectMergeParent(exec),
      mintToken: (appId, key, owner, repo) =>
        mintInstallationToken({ appId, privateKey: key, owner, repo }),
      getLabels: (token, owner, repo, sha) => {
        const oc = new Octokit({ auth: token });
        return getLabelsForCommit({ octokit: oc, owner, repo, sha });
      },
      configureIdentity: (appId) => configureGitIdentity({ appId, exec }),
      commitAndPush: (files, message, remoteUrl, branch, onRetry) =>
        commitAndPush({
          files,
          message,
          remoteUrl,
          branch,
          exec,
          maxRetries: 3,
          onRetry,
        }),
      now: () => new Date(),
      setSecret: (s) => core.setSecret(s),
      log: (m) => core.info(m),
    };

    await runWithEffects(eff);
  } catch (err) {
    core.setFailed((err as Error).message);
  }
}
