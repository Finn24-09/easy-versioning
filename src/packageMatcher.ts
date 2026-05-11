import { minimatch } from 'minimatch';
import { EasyVersioningConfig, PackageConfig } from './types';

const MM_OPTS = { dot: true, nocase: false } as const;

function matchesAny(file: string, patterns: string[]): boolean {
  return patterns.some((p) => minimatch(file, p, MM_OPTS));
}

export function selectPackagesToBump(
  changedFiles: string[],
  config: EasyVersioningConfig
): PackageConfig[] {
  const relevantFiles = changedFiles.filter((f) => !matchesAny(f, config.ignore));
  if (relevantFiles.length === 0) return [];

  return config.packages.filter((pkg) =>
    relevantFiles.some((f) => matchesAny(f, pkg.triggers))
  );
}
