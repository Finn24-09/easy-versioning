import { getBranchHeadOid, getFileContents } from '../src/githubRef';

describe('getBranchHeadOid', () => {
  it('returns the SHA from a heads/{branch} ref response', async () => {
    const octokit = {
      request: jest.fn().mockResolvedValue({
        data: { object: { sha: 'newsha', type: 'commit' } },
      }),
    };
    const sha = await getBranchHeadOid({
      octokit: octokit as never,
      owner: 'octocat',
      repo: 'monorepo',
      branch: 'main',
    });
    expect(sha).toBe('newsha');
    expect(octokit.request).toHaveBeenCalledWith('GET /repos/{owner}/{repo}/git/ref/{ref}', {
      owner: 'octocat',
      repo: 'monorepo',
      ref: 'heads/main',
    });
  });

  it('throws when the response lacks a SHA', async () => {
    const octokit = { request: jest.fn().mockResolvedValue({ data: {} }) };
    await expect(
      getBranchHeadOid({ octokit: octokit as never, owner: 'o', repo: 'r', branch: 'main' })
    ).rejects.toThrow(/HEAD SHA/);
  });
});

describe('getFileContents', () => {
  it('decodes a base64 file payload', async () => {
    const original = '{"version":"26.5.10"}';
    const octokit = {
      request: jest.fn().mockResolvedValue({
        data: {
          type: 'file',
          encoding: 'base64',
          content: Buffer.from(original, 'utf8').toString('base64'),
        },
      }),
    };
    const out = await getFileContents({
      octokit: octokit as never,
      owner: 'o',
      repo: 'r',
      path: 'package.json',
      ref: 'main',
    });
    expect(out).toBe(original);
    expect(octokit.request).toHaveBeenCalledWith('GET /repos/{owner}/{repo}/contents/{path}', {
      owner: 'o',
      repo: 'r',
      path: 'package.json',
      ref: 'main',
    });
  });

  it('rejects directory listings', async () => {
    const octokit = { request: jest.fn().mockResolvedValue({ data: [] }) };
    await expect(
      getFileContents({
        octokit: octokit as never,
        owner: 'o',
        repo: 'r',
        path: 'some/dir',
        ref: 'main',
      })
    ).rejects.toThrow(/directory/);
  });

  it('rejects unsupported encodings', async () => {
    const octokit = {
      request: jest.fn().mockResolvedValue({
        data: { type: 'file', encoding: 'utf-8', content: 'hi' },
      }),
    };
    await expect(
      getFileContents({
        octokit: octokit as never,
        owner: 'o',
        repo: 'r',
        path: 'p.json',
        ref: 'main',
      })
    ).rejects.toThrow(/encoding/);
  });

  it('rejects malformed responses', async () => {
    const octokit = {
      request: jest.fn().mockResolvedValue({ data: { type: 'symlink' } }),
    };
    await expect(
      getFileContents({
        octokit: octokit as never,
        owner: 'o',
        repo: 'r',
        path: 'p.json',
        ref: 'main',
      })
    ).rejects.toThrow(/unexpected response shape/);
  });
});
