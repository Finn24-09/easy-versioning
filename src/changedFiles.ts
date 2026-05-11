export interface ExecResult {
  stdout: string;
  exitCode: number;
}

export type ExecFn = (cmd: string, args: string[]) => Promise<ExecResult>;

export interface DetectChangedFilesParams {
  commitCount: number;
  mergeParent: boolean;
  exec: ExecFn;
}

export async function detectChangedFiles(params: DetectChangedFilesParams): Promise<string[]> {
  if (params.commitCount < 1) {
    throw new Error(`commitCount must be >= 1, got ${params.commitCount}`);
  }
  const baseRef = params.mergeParent ? 'HEAD^1' : `HEAD~${params.commitCount}`;
  const res = await params.exec('git', ['diff', '--name-only', baseRef, 'HEAD']);
  if (res.exitCode !== 0) {
    throw new Error(`git diff failed with exit code ${res.exitCode}`);
  }
  return res.stdout
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function detectMergeParent(exec: ExecFn): Promise<boolean> {
  const res = await exec('git', ['rev-list', '--parents', '-n', '1', 'HEAD']);
  if (res.exitCode !== 0) {
    throw new Error(`git rev-list failed with exit code ${res.exitCode}`);
  }
  const tokens = res.stdout.trim().split(/\s+/);
  return tokens.length - 1 >= 2;
}
