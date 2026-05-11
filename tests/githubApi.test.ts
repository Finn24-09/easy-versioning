import { getLabelsForCommit } from '../src/githubApi';

describe('getLabelsForCommit', () => {
  it('returns merged labels from all associated PRs', async () => {
    const fakeOctokit = {
      request: jest.fn().mockResolvedValue({
        data: [
          { number: 1, labels: [{ name: 'bug' }, { name: 'skip-release' }] },
          { number: 2, labels: [{ name: 'docs' }] },
        ],
      }),
    };
    const labels = await getLabelsForCommit({
      octokit: fakeOctokit as never,
      owner: 'o',
      repo: 'r',
      sha: 'abc',
    });
    expect(labels.sort()).toEqual(['bug', 'docs', 'skip-release']);
  });

  it('returns empty array when no PRs are associated', async () => {
    const fakeOctokit = { request: jest.fn().mockResolvedValue({ data: [] }) };
    const labels = await getLabelsForCommit({
      octokit: fakeOctokit as never,
      owner: 'o',
      repo: 'r',
      sha: 'abc',
    });
    expect(labels).toEqual([]);
  });

  it('passes the correct route and params', async () => {
    const fakeOctokit = { request: jest.fn().mockResolvedValue({ data: [] }) };
    await getLabelsForCommit({
      octokit: fakeOctokit as never,
      owner: 'octocat',
      repo: 'hello',
      sha: 'deadbeef',
    });
    expect(fakeOctokit.request).toHaveBeenCalledWith(
      'GET /repos/{owner}/{repo}/commits/{commit_sha}/pulls',
      { owner: 'octocat', repo: 'hello', commit_sha: 'deadbeef' }
    );
  });

  it('deduplicates label names', async () => {
    const fakeOctokit = {
      request: jest.fn().mockResolvedValue({
        data: [
          { number: 1, labels: [{ name: 'bug' }] },
          { number: 2, labels: [{ name: 'bug' }] },
        ],
      }),
    };
    const labels = await getLabelsForCommit({
      octokit: fakeOctokit as never,
      owner: 'o',
      repo: 'r',
      sha: 'abc',
    });
    expect(labels).toEqual(['bug']);
  });
});
