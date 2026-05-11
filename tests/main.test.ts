// Mock ESM-only dependencies that can't be transformed by Jest
jest.mock('@octokit/auth-app', () => ({
  createAppAuth: jest.fn(),
}));

import { runWithEffects, MainEffects } from '../src/main';

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
    configureIdentity: jest.fn(async () => undefined),
    commitAndPush: jest.fn(async () => undefined),
    now: () => new Date(Date.UTC(2026, 4, 10)),
    setSecret: jest.fn(),
    log: jest.fn(),
    ...overrides,
  } as MainEffects;
}

describe('runWithEffects: happy path', () => {
  it('bumps the matched package', async () => {
    const writeFile = jest.fn(async () => undefined);
    const commitAndPush = jest.fn(async () => undefined);
    const eff = makeEffects({ writeFile, commitAndPush });

    await runWithEffects(eff);

    expect(writeFile).toHaveBeenCalledWith(
      'packages/ui/package.json',
      expect.stringContaining('"version":"26.5.10"')
    );
    expect(commitAndPush).toHaveBeenCalled();
  });
});

describe('runWithEffects: skip-label', () => {
  it('exits early when the merged PR has the skip label', async () => {
    const commitAndPush = jest.fn(async () => undefined);
    const eff = makeEffects({
      getLabels: async () => ['skip-release'],
      commitAndPush,
    });
    await runWithEffects(eff);
    expect(commitAndPush).not.toHaveBeenCalled();
  });
});

describe('runWithEffects: no matching package', () => {
  it('exits without committing when no triggers match', async () => {
    const commitAndPush = jest.fn(async () => undefined);
    const eff = makeEffects({
      detectChangedFiles: async () => ['some/unrelated/path.ts'],
      commitAndPush,
    });
    await runWithEffects(eff);
    expect(commitAndPush).not.toHaveBeenCalled();
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
