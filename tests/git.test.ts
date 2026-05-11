import { configureGitIdentity, commitAndPush } from '../src/git';

const makeExec = (responses: Array<{ stdout?: string; exitCode?: number }>) => {
  const calls: string[][] = [];
  let i = 0;
  const exec = async (cmd: string, args: string[]) => {
    calls.push([cmd, ...args]);
    const r = responses[i++] ?? { stdout: '', exitCode: 0 };
    return { stdout: r.stdout ?? '', exitCode: r.exitCode ?? 0 };
  };
  return { calls, exec };
};

describe('configureGitIdentity', () => {
  it('sets the bot user.name and user.email', async () => {
    const { calls, exec } = makeExec([{}, {}]);
    await configureGitIdentity({ appId: 12345, exec });
    expect(calls).toEqual([
      ['git', 'config', 'user.name', 'easy-versioning[bot]'],
      ['git', 'config', 'user.email', '12345+easy-versioning[bot]@users.noreply.github.com'],
    ]);
  });
});

describe('commitAndPush', () => {
  it('stages, commits, and pushes on first try', async () => {
    const { calls, exec } = makeExec([{}, {}, {}]);
    await commitAndPush({
      files: ['package.json'],
      message: 'chore(release): bump [skip ci]',
      remoteUrl: 'https://x-access-token:TOKEN@github.com/octocat/repo.git',
      branch: 'main',
      exec,
      maxRetries: 3,
    });
    expect(calls[0]).toEqual(['git', 'add', '--', 'package.json']);
    expect(calls[1]).toEqual(['git', 'commit', '-m', 'chore(release): bump [skip ci]']);
    expect(calls[2][0]).toEqual('git');
    expect(calls[2][1]).toEqual('push');
    expect(calls[2][2]).toEqual('https://x-access-token:TOKEN@github.com/octocat/repo.git');
    expect(calls[2][3]).toEqual('HEAD:main');
  });

  it('retries on push failure by rebasing and recommitting', async () => {
    const { calls, exec } = makeExec([
      {}, // add (try 1)
      {}, // commit (try 1)
      { exitCode: 1, stdout: 'rejected non-fast-forward' }, // push fail
      {}, // git fetch
      {}, // git reset --hard
      {}, // add (try 2)
      {}, // commit (try 2)
      {}, // push (try 2) ok
    ]);
    let recomputeCalls = 0;
    await commitAndPush({
      files: ['package.json'],
      message: 'msg',
      remoteUrl: 'https://x-access-token:T@github.com/o/r.git',
      branch: 'main',
      exec,
      maxRetries: 3,
      onRetry: async () => {
        recomputeCalls++;
      },
    });
    expect(recomputeCalls).toBe(1);
    expect(calls.some((c) => c[1] === 'fetch')).toBe(true);
    expect(calls.some((c) => c[1] === 'reset')).toBe(true);
  });

  it('throws after exceeding maxRetries', async () => {
    const { exec } = makeExec([
      {},
      {},
      { exitCode: 1, stdout: 'rejected' },
      {},
      {},
      {},
      {},
      { exitCode: 1, stdout: 'rejected' },
      {},
      {},
      {},
      {},
      { exitCode: 1, stdout: 'rejected' },
    ]);
    await expect(
      commitAndPush({
        files: ['p.json'],
        message: 'm',
        remoteUrl: 'u',
        branch: 'main',
        exec,
        maxRetries: 2,
        onRetry: async () => undefined,
      })
    ).rejects.toThrow(/push failed/i);
  });

  it('throws when git add fails', async () => {
    const { exec } = makeExec([{ exitCode: 1 }]);
    await expect(
      commitAndPush({
        files: ['p.json'],
        message: 'm',
        remoteUrl: 'u',
        branch: 'main',
        exec,
        maxRetries: 1,
      })
    ).rejects.toThrow(/git add failed/i);
  });

  it('throws when git commit fails', async () => {
    const { exec } = makeExec([{}, { exitCode: 1 }]);
    await expect(
      commitAndPush({
        files: ['p.json'],
        message: 'm',
        remoteUrl: 'u',
        branch: 'main',
        exec,
        maxRetries: 1,
      })
    ).rejects.toThrow(/git commit failed/i);
  });
});
