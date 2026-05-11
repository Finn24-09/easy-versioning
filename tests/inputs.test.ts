import { parseInputs } from '../src/inputs';

describe('parseInputs', () => {
  it('parses required inputs', () => {
    const got = parseInputs({
      'app-id': '12345',
      'private-key': '-----BEGIN PRIVATE KEY-----\nfoo\n-----END PRIVATE KEY-----',
    });
    expect(got.appId).toBe(12345);
    expect(got.privateKey).toContain('BEGIN PRIVATE KEY');
  });

  it('throws when app-id is missing', () => {
    expect(() => parseInputs({ 'private-key': 'pk' })).toThrow(/app-id/);
  });

  it('throws when private-key is missing', () => {
    expect(() => parseInputs({ 'app-id': '1' })).toThrow(/private-key/);
  });

  it('throws when app-id is not a number', () => {
    expect(() =>
      parseInputs({ 'app-id': 'notanumber', 'private-key': 'pk' })
    ).toThrow(/app-id.*number/i);
  });

  it('uses default config-path', () => {
    const got = parseInputs({ 'app-id': '1', 'private-key': 'pk' });
    expect(got.configPath).toBe('.github/easy-versioning.yml');
  });

  it('respects custom config-path', () => {
    const got = parseInputs({
      'app-id': '1',
      'private-key': 'pk',
      'config-path': 'foo/bar.yml',
    });
    expect(got.configPath).toBe('foo/bar.yml');
  });
});
