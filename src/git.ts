import { ExecFn } from './changedFiles';

export interface ConfigureIdentityParams {
  appId: number;
  exec: ExecFn;
}

export async function configureGitIdentity(params: ConfigureIdentityParams): Promise<void> {
  await params.exec('git', ['config', 'user.name', 'easy-versioning[bot]']);
  await params.exec('git', [
    'config',
    'user.email',
    `${params.appId}+easy-versioning[bot]@users.noreply.github.com`,
  ]);
}

export interface CommitAndPushParams {
  files: string[];
  message: string;
  remoteUrl: string;
  branch: string;
  exec: ExecFn;
  maxRetries: number;
  onRetry?: () => Promise<void>;
}

export async function commitAndPush(params: CommitAndPushParams): Promise<void> {
  let attempt = 0;
  let lastErr: Error | null = null;

  while (attempt <= params.maxRetries) {
    if (attempt > 0) {
      await params.exec('git', ['fetch', params.remoteUrl, params.branch]);
      await params.exec('git', ['reset', '--hard', 'FETCH_HEAD']);
      if (params.onRetry) await params.onRetry();
    }

    const addRes = await params.exec('git', ['add', '--', ...params.files]);
    if (addRes.exitCode !== 0) {
      throw new Error(`git add failed with exit code ${addRes.exitCode}`);
    }
    const commitRes = await params.exec('git', ['commit', '-m', params.message]);
    if (commitRes.exitCode !== 0) {
      throw new Error(`git commit failed with exit code ${commitRes.exitCode}`);
    }
    const pushRes = await params.exec('git', [
      'push',
      params.remoteUrl,
      `HEAD:${params.branch}`,
    ]);
    if (pushRes.exitCode === 0) return;

    lastErr = new Error(`git push failed: ${pushRes.stdout}`);
    attempt++;
  }

  throw new Error(
    `git push failed after ${params.maxRetries + 1} attempts: ${lastErr?.message}`,
  );
}
