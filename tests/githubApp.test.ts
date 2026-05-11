import { mintInstallationToken } from '../src/githubApp';

jest.mock('@octokit/auth-app', () => ({
  createAppAuth: jest.fn(),
}));

const { createAppAuth } = jest.requireMock('@octokit/auth-app') as {
  createAppAuth: jest.Mock;
};

describe('mintInstallationToken', () => {
  beforeEach(() => {
    createAppAuth.mockReset();
  });

  it('returns the installation token from the App auth flow', async () => {
    const auth = jest
      .fn()
      .mockResolvedValueOnce({ type: 'app', token: 'jwt-token' })
      .mockResolvedValueOnce({ token: 'ghs_installtoken' });

    createAppAuth.mockReturnValue(auth);

    const fakeOctokitForApp = {
      request: jest.fn().mockResolvedValue({ data: { id: 555 } }),
    };

    const token = await mintInstallationToken({
      appId: 12345,
      privateKey: 'pk',
      owner: 'octocat',
      repo: 'hello-world',
      __octokitFactory: () => fakeOctokitForApp,
    });

    expect(token).toBe('ghs_installtoken');
    expect(createAppAuth).toHaveBeenCalledWith({ appId: 12345, privateKey: 'pk' });
    expect(fakeOctokitForApp.request).toHaveBeenCalledWith(
      'GET /repos/{owner}/{repo}/installation',
      { owner: 'octocat', repo: 'hello-world' }
    );
  });

  it('throws if the App is not installed on the repo', async () => {
    const auth = jest.fn().mockResolvedValueOnce({ type: 'app', token: 'jwt' });
    createAppAuth.mockReturnValue(auth);
    const fakeOctokitForApp = {
      request: jest.fn().mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 })),
    };

    await expect(
      mintInstallationToken({
        appId: 1,
        privateKey: 'pk',
        owner: 'octocat',
        repo: 'hello',
        __octokitFactory: () => fakeOctokitForApp,
      })
    ).rejects.toThrow(/not installed/i);
  });
});
