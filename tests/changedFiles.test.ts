import { detectChangedFiles, detectMergeParent } from '../src/changedFiles';

describe('detectChangedFiles', () => {
  it('diffs HEAD~N..HEAD for an N-commit push', async () => {
    const calls: string[][] = [];
    const exec = async (cmd: string, args: string[]) => {
      calls.push([cmd, ...args]);
      return { stdout: 'src/a.ts\nsrc/b.ts\n', exitCode: 0 };
    };
    const result = await detectChangedFiles({ commitCount: 3, mergeParent: false, exec });
    expect(result).toEqual(['src/a.ts', 'src/b.ts']);
    expect(calls[0]).toEqual(['git', 'diff', '--name-only', 'HEAD~3', 'HEAD']);
  });

  it('uses HEAD^1 for a true merge commit', async () => {
    const calls: string[][] = [];
    const exec = async (cmd: string, args: string[]) => {
      calls.push([cmd, ...args]);
      return { stdout: 'pkg/x.ts\n', exitCode: 0 };
    };
    const result = await detectChangedFiles({ commitCount: 1, mergeParent: true, exec });
    expect(result).toEqual(['pkg/x.ts']);
    expect(calls[0]).toEqual(['git', 'diff', '--name-only', 'HEAD^1', 'HEAD']);
  });

  it('handles single-commit squash with HEAD~1', async () => {
    const calls: string[][] = [];
    const exec = async (cmd: string, args: string[]) => {
      calls.push([cmd, ...args]);
      return { stdout: '', exitCode: 0 };
    };
    const result = await detectChangedFiles({ commitCount: 1, mergeParent: false, exec });
    expect(result).toEqual([]);
    expect(calls[0]).toEqual(['git', 'diff', '--name-only', 'HEAD~1', 'HEAD']);
  });

  it('handles trailing newlines and empty lines correctly', async () => {
    const exec = async () => ({ stdout: 'a.ts\n\nb.ts\n\n', exitCode: 0 });
    const result = await detectChangedFiles({ commitCount: 1, mergeParent: false, exec });
    expect(result).toEqual(['a.ts', 'b.ts']);
  });

  it('throws if commitCount is zero', async () => {
    const exec = async () => ({ stdout: '', exitCode: 0 });
    await expect(
      detectChangedFiles({ commitCount: 0, mergeParent: false, exec })
    ).rejects.toThrow(/commitCount/);
  });
});

describe('detectMergeParent', () => {
  it('returns true when HEAD has 2 parents', async () => {
    const exec = async () => ({ stdout: 'abc def ghi\n', exitCode: 0 });
    expect(await detectMergeParent(exec)).toBe(true);
  });

  it('returns true when HEAD has 3 parents (octopus merge)', async () => {
    const exec = async () => ({ stdout: 'a b c d\n', exitCode: 0 });
    expect(await detectMergeParent(exec)).toBe(true);
  });

  it('returns false when HEAD has 1 parent', async () => {
    const exec = async () => ({ stdout: 'abc def\n', exitCode: 0 });
    expect(await detectMergeParent(exec)).toBe(false);
  });

  it('returns false when HEAD has no parents (root commit)', async () => {
    const exec = async () => ({ stdout: 'abc\n', exitCode: 0 });
    expect(await detectMergeParent(exec)).toBe(false);
  });

  it('throws when git rev-list fails', async () => {
    const exec = async () => ({ stdout: '', exitCode: 128 });
    await expect(detectMergeParent(exec)).rejects.toThrow(/rev-list/);
  });
});
