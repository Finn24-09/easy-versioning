import { readVersion, writeVersion } from '../src/packageJson';

describe('readVersion', () => {
  it('reads the version field', () => {
    expect(readVersion('{"name":"foo","version":"1.2.3"}')).toBe('1.2.3');
  });

  it('returns undefined when version is missing', () => {
    expect(readVersion('{"name":"foo"}')).toBeUndefined();
  });

  it('handles formatted JSON', () => {
    const pkg = `{
  "name": "foo",
  "version": "26.5.10",
  "description": "bar"
}
`;
    expect(readVersion(pkg)).toBe('26.5.10');
  });

  it('throws on invalid JSON', () => {
    expect(() => readVersion('{not json')).toThrow();
  });
});

describe('writeVersion', () => {
  it('replaces an existing version field', () => {
    const input = '{"name":"foo","version":"1.2.3"}';
    expect(writeVersion(input, '26.5.10')).toBe('{"name":"foo","version":"26.5.10"}');
  });

  it('preserves 2-space indentation', () => {
    const input = `{
  "name": "foo",
  "version": "1.2.3"
}
`;
    const expected = `{
  "name": "foo",
  "version": "26.5.10"
}
`;
    expect(writeVersion(input, '26.5.10')).toBe(expected);
  });

  it('preserves 4-space indentation', () => {
    const input = `{
    "name": "foo",
    "version": "1.2.3"
}
`;
    const expected = `{
    "name": "foo",
    "version": "26.5.10"
}
`;
    expect(writeVersion(input, '26.5.10')).toBe(expected);
  });

  it('preserves tab indentation', () => {
    const input = '{\n\t"name": "foo",\n\t"version": "1.2.3"\n}\n';
    const expected = '{\n\t"name": "foo",\n\t"version": "26.5.10"\n}\n';
    expect(writeVersion(input, '26.5.10')).toBe(expected);
  });

  it('preserves trailing newline absence', () => {
    const input = '{"name":"foo","version":"1.2.3"}';
    expect(writeVersion(input, '26.5.10').endsWith('\n')).toBe(false);
  });

  it('preserves trailing newline presence', () => {
    const input = '{"name":"foo","version":"1.2.3"}\n';
    expect(writeVersion(input, '26.5.10').endsWith('\n')).toBe(true);
  });

  it('inserts version when missing (after name)', () => {
    const input = `{
  "name": "foo",
  "description": "bar"
}
`;
    const result = writeVersion(input, '26.5.10');
    expect(readVersion(result)).toBe('26.5.10');
    expect(JSON.parse(result).description).toBe('bar');
  });

  it('inserts version when no name field exists', () => {
    const input = `{
  "description": "bar"
}
`;
    const result = writeVersion(input, '26.5.10');
    expect(readVersion(result)).toBe('26.5.10');
  });

  it('handles version with prerelease tag', () => {
    const input = '{"version":"1.2.3"}';
    expect(writeVersion(input, '26.5.10-1')).toBe('{"version":"26.5.10-1"}');
  });

  it('only replaces the top-level version, not nested ones', () => {
    const input = `{
  "name": "foo",
  "version": "1.2.3",
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "bar": {
      "version": "9.9.9"
    }
  }
}
`;
    const result = writeVersion(input, '26.5.10');
    expect(readVersion(result)).toBe('26.5.10');
    expect(result).toContain('"version": "9.9.9"');
  });
});
