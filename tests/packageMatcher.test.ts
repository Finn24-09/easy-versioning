import { selectPackagesToBump } from '../src/packageMatcher';
import { EasyVersioningConfig } from '../src/types';

const baseConfig: EasyVersioningConfig = {
  skipLabel: 'skip-release',
  timezone: 'UTC',
  ignore: [],
  packages: [
    { path: 'packages/ui', triggers: ['packages/ui/**', 'packages/shared/**'] },
    { path: 'packages/api', triggers: ['packages/api/**', 'packages/shared/**'] },
    { path: 'packages/cli', triggers: ['packages/cli/**'] },
  ],
};

describe('selectPackagesToBump', () => {
  it('returns empty when no files changed', () => {
    expect(selectPackagesToBump([], baseConfig)).toEqual([]);
  });

  it('selects a single package when only its files changed', () => {
    const changed = ['packages/ui/src/Button.tsx', 'packages/ui/src/Modal.tsx'];
    const result = selectPackagesToBump(changed, baseConfig);
    expect(result.map((p) => p.path)).toEqual(['packages/ui']);
  });

  it('selects multiple packages when shared deps change', () => {
    const changed = ['packages/shared/src/utils.ts'];
    const result = selectPackagesToBump(changed, baseConfig);
    expect(result.map((p) => p.path).sort()).toEqual(['packages/api', 'packages/ui']);
  });

  it('selects all matching packages for a multi-path change', () => {
    const changed = ['packages/ui/x.ts', 'packages/cli/y.ts'];
    const result = selectPackagesToBump(changed, baseConfig);
    expect(result.map((p) => p.path).sort()).toEqual(['packages/cli', 'packages/ui']);
  });

  it('respects the ignore list', () => {
    const cfg: EasyVersioningConfig = { ...baseConfig, ignore: ['**/*.md', 'docs/**'] };
    const changed = ['packages/ui/README.md', 'docs/intro.md'];
    expect(selectPackagesToBump(changed, cfg)).toEqual([]);
  });

  it('only considers non-ignored files for matching', () => {
    const cfg: EasyVersioningConfig = { ...baseConfig, ignore: ['**/*.md'] };
    const changed = ['packages/ui/README.md', 'packages/ui/src/Button.tsx'];
    const result = selectPackagesToBump(changed, cfg);
    expect(result.map((p) => p.path)).toEqual(['packages/ui']);
  });

  it('does not double-include a package matched by multiple files', () => {
    const changed = ['packages/ui/a.ts', 'packages/ui/b.ts', 'packages/shared/c.ts'];
    const result = selectPackagesToBump(changed, baseConfig);
    expect(result.filter((p) => p.path === 'packages/ui')).toHaveLength(1);
  });

  it('preserves the order of packages from the config', () => {
    const changed = ['packages/cli/x.ts', 'packages/ui/y.ts', 'packages/api/z.ts'];
    const result = selectPackagesToBump(changed, baseConfig);
    expect(result.map((p) => p.path)).toEqual(['packages/ui', 'packages/api', 'packages/cli']);
  });

  it('handles default config (root path with **/* triggers)', () => {
    const cfg: EasyVersioningConfig = {
      skipLabel: 'skip-release',
      timezone: 'UTC',
      ignore: [],
      packages: [{ path: '.', triggers: ['**/*'] }],
    };
    const changed = ['src/foo.ts', 'README.md'];
    expect(selectPackagesToBump(changed, cfg).map((p) => p.path)).toEqual(['.']);
  });
});
