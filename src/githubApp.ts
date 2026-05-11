import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';

export interface MintTokenParams {
  appId: number;
  privateKey: string;
  owner: string;
  repo: string;
  // Test seam: override Octokit factory used to call the installation lookup.
  __octokitFactory?: (auth: { type: 'app'; token: string }) => {
    request: (route: string, params: object) => Promise<{ data: { id: number } }>;
  };
}

export async function mintInstallationToken(params: MintTokenParams): Promise<string> {
  const auth = createAppAuth({ appId: params.appId, privateKey: params.privateKey });

  const appAuthResult = (await auth({ type: 'app' })) as { type: 'app'; token: string };

  const octokit =
    params.__octokitFactory?.(appAuthResult) ?? new Octokit({ auth: appAuthResult.token });

  let installationId: number;
  try {
    const res = await octokit.request('GET /repos/{owner}/{repo}/installation', {
      owner: params.owner,
      repo: params.repo,
    });
    installationId = res.data.id;
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 404) {
      throw new Error(
        `easy-versioning App is not installed on ${params.owner}/${params.repo}. Install the App from its public URL and try again.`
      );
    }
    throw err;
  }

  const installAuthResult = (await auth({
    type: 'installation',
    installationId,
  })) as { token: string };

  return installAuthResult.token;
}
