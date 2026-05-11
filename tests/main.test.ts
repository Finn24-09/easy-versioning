// Mock ESM-only dependencies that can't be transformed by Jest
jest.mock('@octokit/auth-app', () => ({
  createAppAuth: jest.fn(),
}));

import { runWithEffects, MainEffects, CreateSignedCommitInput } from '../src/main';
import { CommitConflictError } from '../src/githubCommit';

type CreateSignedCommitFn = MainEffects['createSignedCommit'];

function mockCreateSignedCommit(
  impl: (params: CreateSignedCommitInput) => Promise<{ commitSha: string }>
): jest.MockedFunction<CreateSignedCommitFn> {
  return jest.fn(impl) as jest.MockedFunction<CreateSignedCommitFn>;
}

const baseInputs = {
  'app-id': '12345',
  'private-key': 'pk',
  'config-path': '.github/easy-versioning.yml',
};

const baseContext = {
  owner: 'octocat',
  repo: 'monorepo',
  branch: 'main',
  sha: 'abc123',
  commitCount: 1,
};

function makeEffects(overrides: Partial<MainEffects> = {}): MainEffects {
  return {
    getInput: (k) => (baseInputs as Record<string, string>)[k],
    getContext: () => baseContext,
    readFile: async (p) => {
      if (p === '.github/easy-versioning.yml') {
        return `packages:\n  - path: packages/ui\n    triggers: ['packages/ui/**']`;
      }
      if (p === 'packages/ui/package.json') {
        return '{"name":"ui","version":"26.5.9"}';
      }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    },
    writeFile: jest.fn(async () => undefined),
    detectChangedFiles: async () => ['packages/ui/src/Button.tsx'],
    detectMergeParent: async () => false,
    mintToken: async () => 'install-token',
    getLabels: async () => [],
    createSignedCommit: jest.fn(async () => ({ commitSha: 'new-sha' })),
    getBranchHeadOid: jest.fn(async () => 'remote-head-sha'),
    getRemoteFileContents: jest.fn(async () => '{"name":"ui","version":"26.5.9"}'),
    now: () => new Date(Date.UTC(2026, 4, 10)),
    setSecret: jest.fn(),
    log: jest.fn(),
    ...overrides,
  } as MainEffects;
}

describe('runWithEffects: happy path', () => {
  it('bumps the matched package and creates a signed commit', async () => {
    const writeFile = jest.fn(async () => undefined);
    const createSignedCommit = mockCreateSignedCommit(async () => ({ commitSha: 'new-sha' }));
    const eff = makeEffects({ writeFile, createSignedCommit });

    await runWithEffects(eff);

    expect(writeFile).toHaveBeenCalledWith(
      'packages/ui/package.json',
      expect.stringContaining('"version":"26.5.10"')
    );
    expect(createSignedCommit).toHaveBeenCalledTimes(1);
    const call = createSignedCommit.mock.calls[0]?.[0];
    if (!call) throw new Error('expected createSignedCommit to have been called');
    expect(call).toMatchObject({
      token: 'install-token',
      owner: 'octocat',
      repo: 'monorepo',
      branch: 'main',
      expectedHeadOid: 'abc123',
      headline: expect.stringMatching(/chore\(release\): bump versions \[skip ci\]/),
    });
    expect(call.additions).toEqual([
      {
        path: 'packages/ui/package.json',
        contents: expect.stringContaining('"version":"26.5.10"'),
      },
    ]);
    expect(call.body).toContain('packages/ui: 26.5.9 -> 26.5.10');
  });
});

describe('runWithEffects: skip-label', () => {
  it('exits early when the merged PR has the skip label', async () => {
    const createSignedCommit = jest.fn(async () => ({ commitSha: 'x' }));
    const eff = makeEffects({
      getLabels: async () => ['skip-release'],
      createSignedCommit,
    });
    await runWithEffects(eff);
    expect(createSignedCommit).not.toHaveBeenCalled();
  });
});

describe('runWithEffects: no matching package', () => {
  it('exits without committing when no triggers match', async () => {
    const createSignedCommit = jest.fn(async () => ({ commitSha: 'x' }));
    const eff = makeEffects({
      detectChangedFiles: async () => ['some/unrelated/path.ts'],
      createSignedCommit,
    });
    await runWithEffects(eff);
    expect(createSignedCommit).not.toHaveBeenCalled();
  });
});

describe('runWithEffects: no config file', () => {
  it('falls back to bumping the root package.json', async () => {
    const writeFile = jest.fn(async () => undefined);
    const eff = makeEffects({
      readFile: async (p) => {
        if (p === '.github/easy-versioning.yml') {
          throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        }
        if (p === 'package.json') return '{"name":"app","version":"1.0.0"}';
        throw new Error('unexpected read: ' + p);
      },
      writeFile,
      detectChangedFiles: async () => ['src/foo.ts'],
    });
    await runWithEffects(eff);
    expect(writeFile).toHaveBeenCalledWith(
      'package.json',
      expect.stringContaining('"version":"26.5.10"')
    );
  });
});

describe('runWithEffects: same-day collision', () => {
  it('produces the -1 suffix for the second bump of the day', async () => {
    const writeFile = jest.fn(async () => undefined);
    const eff = makeEffects({
      readFile: async (p) => {
        if (p === '.github/easy-versioning.yml')
          throw Object.assign(new Error(), { code: 'ENOENT' });
        if (p === 'package.json') return '{"version":"26.5.10"}';
        throw new Error('unexpected: ' + p);
      },
      writeFile,
      detectChangedFiles: async () => ['x.ts'],
    });
    await runWithEffects(eff);
    expect(writeFile).toHaveBeenCalledWith(
      'package.json',
      expect.stringContaining('"version":"26.5.10-1"')
    );
  });
});

describe('runWithEffects: validates package.json existence at config-time', () => {
  it('throws a clear error when a configured package path has no package.json', async () => {
    const eff = makeEffects({
      readFile: async (p) => {
        if (p === '.github/easy-versioning.yml') {
          return `packages:\n  - path: packages/ui\n    triggers: ['packages/ui/**']`;
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      },
      detectChangedFiles: async () => ['packages/ui/x.ts'],
    });
    await expect(runWithEffects(eff)).rejects.toThrow(/packages\/ui\/package\.json/);
  });
});

describe('runWithEffects: commit retry on conflict', () => {
  it('refreshes the expected head and re-fetches file contents on CommitConflictError, then succeeds', async () => {
    let attempts = 0;
    const createSignedCommit = mockCreateSignedCommit(async (params) => {
      attempts++;
      if (attempts === 1) {
        expect(params.expectedHeadOid).toBe('abc123');
        throw new CommitConflictError('stale');
      }
      expect(params.expectedHeadOid).toBe('refreshed-head-sha');
      return { commitSha: 'final-sha' };
    });
    const getBranchHeadOid = jest.fn(async () => 'refreshed-head-sha');
    const getRemoteFileContents = jest.fn(async () => '{"name":"ui","version":"26.5.10"}');

    const eff = makeEffects({
      createSignedCommit,
      getBranchHeadOid,
      getRemoteFileContents,
    });

    await runWithEffects(eff);

    expect(createSignedCommit).toHaveBeenCalledTimes(2);
    expect(getBranchHeadOid).toHaveBeenCalledTimes(1);
    expect(getRemoteFileContents).toHaveBeenCalledWith(
      'install-token',
      'octocat',
      'monorepo',
      'packages/ui/package.json',
      'refreshed-head-sha'
    );
    // After the first attempt landed somebody else's bump to 26.5.10, our
    // retry should produce 26.5.10-1.
    const finalCall = createSignedCommit.mock.calls[1]?.[0];
    if (!finalCall) throw new Error('expected a second createSignedCommit call');
    expect(finalCall.additions[0].contents).toContain('"version":"26.5.10-1"');
  });

  it('gives up after the maximum retry attempts and throws', async () => {
    const createSignedCommit = mockCreateSignedCommit(async () => {
      throw new CommitConflictError('always stale');
    });
    const eff = makeEffects({
      createSignedCommit,
      getBranchHeadOid: jest.fn(async () => 'stale-sha'),
      getRemoteFileContents: jest.fn(async () => '{"name":"ui","version":"26.5.9"}'),
    });
    await expect(runWithEffects(eff)).rejects.toThrow(/failed to push bump commit/);
    expect(createSignedCommit).toHaveBeenCalledTimes(4);
  });

  it('does not retry on non-conflict errors', async () => {
    const createSignedCommit = mockCreateSignedCommit(async () => {
      throw new Error('boom');
    });
    const eff = makeEffects({ createSignedCommit });
    await expect(runWithEffects(eff)).rejects.toThrow(/boom/);
    expect(createSignedCommit).toHaveBeenCalledTimes(1);
  });
});
