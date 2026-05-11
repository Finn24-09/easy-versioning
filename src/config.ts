import * as yaml from 'js-yaml';
import { EasyVersioningConfig, PackageConfig } from './types';

export const DEFAULT_CONFIG: EasyVersioningConfig = {
  skipLabel: 'skip-release',
  timezone: 'UTC',
  ignore: [],
  packages: [{ path: '.', triggers: ['**/*'] }],
};

export function parseConfig(input: string | undefined): EasyVersioningConfig {
  if (input === undefined) {
    return DEFAULT_CONFIG;
  }

  let raw: unknown;
  try {
    raw = yaml.load(input);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`config: invalid YAML: ${msg}`);
  }

  // Empty YAML doc → treat as DEFAULT_CONFIG
  if (raw === null || raw === undefined) {
    return DEFAULT_CONFIG;
  }

  // Must be a plain object, not array or scalar
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('config: expected a YAML mapping at top level');
  }

  const obj = raw as Record<string, unknown>;

  // Validate packages (required)
  if (!('packages' in obj)) {
    throw new Error('config: missing required field "packages"');
  }

  if (!Array.isArray(obj['packages'])) {
    throw new Error('config: packages must be an array');
  }

  const rawPackages = obj['packages'] as unknown[];

  if (rawPackages.length === 0) {
    throw new Error('config: packages must contain at least one entry');
  }

  const packages: PackageConfig[] = rawPackages.map((entry, i) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`config: packages[${i}] must be an object`);
    }
    const pkg = entry as Record<string, unknown>;

    if (typeof pkg['path'] !== 'string') {
      throw new Error(`config: packages[${i}] is missing a valid "path" string`);
    }

    if (!('triggers' in pkg)) {
      throw new Error(`config: packages[${i}] is missing required field "triggers"`);
    }

    if (!Array.isArray(pkg['triggers'])) {
      throw new Error(`config: packages[${i}].triggers must be an array`);
    }

    const triggers = pkg['triggers'] as unknown[];

    if (triggers.length === 0) {
      throw new Error(`config: packages[${i}].triggers must contain at least one pattern`);
    }

    return {
      path: pkg['path'] as string,
      triggers: triggers as string[],
    };
  });

  // Validate timezone if provided
  const timezone = typeof obj['timezone'] === 'string' ? obj['timezone'] : DEFAULT_CONFIG.timezone;

  if (typeof obj['timezone'] === 'string') {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    } catch {
      throw new Error(`config: invalid timezone "${timezone}"`);
    }
  }

  // Validate ignore if provided
  const ignore = Array.isArray(obj['ignore']) ? (obj['ignore'] as string[]) : DEFAULT_CONFIG.ignore;

  // skipLabel (yaml key is skip-label)
  const skipLabel =
    typeof obj['skip-label'] === 'string' ? obj['skip-label'] : DEFAULT_CONFIG.skipLabel;

  return {
    skipLabel,
    timezone,
    ignore,
    packages,
  };
}
