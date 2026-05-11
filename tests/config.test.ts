import { parseConfig, DEFAULT_CONFIG } from '../src/config';

describe('parseConfig', () => {
  it('returns DEFAULT_CONFIG when input is undefined', () => {
    expect(parseConfig(undefined)).toEqual(DEFAULT_CONFIG);
  });

  it('parses a full valid config', () => {
    const yaml = `
skip-label: skip-release
timezone: UTC
ignore:
  - '**/*.md'
  - 'docs/**'
packages:
  - path: packages/ui
    triggers:
      - packages/ui/**
      - packages/shared/**
  - path: packages/api
    triggers:
      - packages/api/**
`;
    expect(parseConfig(yaml)).toEqual({
      skipLabel: 'skip-release',
      timezone: 'UTC',
      ignore: ['**/*.md', 'docs/**'],
      packages: [
        { path: 'packages/ui', triggers: ['packages/ui/**', 'packages/shared/**'] },
        { path: 'packages/api', triggers: ['packages/api/**'] },
      ],
    });
  });

  it('applies defaults for omitted optional fields', () => {
    const yaml = `
packages:
  - path: .
    triggers: ['**/*']
`;
    const result = parseConfig(yaml);
    expect(result.skipLabel).toBe('skip-release');
    expect(result.timezone).toBe('UTC');
    expect(result.ignore).toEqual([]);
    expect(result.packages).toEqual([{ path: '.', triggers: ['**/*'] }]);
  });

  it('throws on invalid YAML', () => {
    expect(() => parseConfig('not: valid: yaml: here:')).toThrow(/yaml/i);
  });

  it('throws when packages key is missing', () => {
    expect(() => parseConfig('skip-label: foo')).toThrow(/packages/);
  });

  it('throws when packages is not an array', () => {
    expect(() => parseConfig('packages: notalist')).toThrow(/packages.*array/);
  });

  it('throws when packages is empty', () => {
    expect(() => parseConfig('packages: []')).toThrow(/at least one/);
  });

  it('throws when a package has no path', () => {
    expect(() => parseConfig(`packages:\n  - triggers: ['**/*']`)).toThrow(/path/);
  });

  it('throws when a package has no triggers', () => {
    expect(() => parseConfig(`packages:\n  - path: foo`)).toThrow(/triggers/);
  });

  it('throws when a package has empty triggers', () => {
    expect(() => parseConfig(`packages:\n  - path: foo\n    triggers: []`)).toThrow(/at least one/);
  });

  it('throws on invalid timezone', () => {
    expect(() =>
      parseConfig(`timezone: Not/A_Timezone\npackages:\n  - path: .\n    triggers: ['**/*']`)
    ).toThrow(/timezone/i);
  });

  it('accepts valid IANA timezones', () => {
    const yaml = `timezone: America/Los_Angeles\npackages:\n  - path: .\n    triggers: ['**/*']`;
    expect(parseConfig(yaml).timezone).toBe('America/Los_Angeles');
  });
});

describe('DEFAULT_CONFIG', () => {
  it('bumps the root package.json on every change', () => {
    expect(DEFAULT_CONFIG.packages).toEqual([{ path: '.', triggers: ['**/*'] }]);
  });

  it('uses sensible defaults', () => {
    expect(DEFAULT_CONFIG.skipLabel).toBe('skip-release');
    expect(DEFAULT_CONFIG.timezone).toBe('UTC');
    expect(DEFAULT_CONFIG.ignore).toEqual([]);
  });
});
