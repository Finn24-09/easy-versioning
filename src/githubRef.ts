import { Octokit } from '@octokit/rest';

export interface RefRequestOctokit {
  request: (route: string, params: object) => Promise<{ data: unknown }>;
}

export interface GetBranchHeadOidParams {
  octokit: Pick<Octokit, 'request'> | RefRequestOctokit;
  owner: string;
  repo: string;
  branch: string;
}

/**
 * Look up the current HEAD commit SHA for `branch` via the REST refs API. Used
 * on conflict-retry to refresh the `expectedHeadOid` we pass to
 * `createCommitOnBranch`.
 */
export async function getBranchHeadOid(params: GetBranchHeadOidParams): Promise<string> {
  const res = await params.octokit.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
    owner: params.owner,
    repo: params.repo,
    ref: `heads/${params.branch}`,
  });
  const data = res.data as { object?: { sha?: string } } | undefined;
  const sha = data?.object?.sha;
  if (!sha) {
    throw new Error(`unable to read HEAD SHA for ${params.owner}/${params.repo}@${params.branch}`);
  }
  return sha;
}

export interface GetFileContentsParams {
  octokit: Pick<Octokit, 'request'> | RefRequestOctokit;
  owner: string;
  repo: string;
  path: string;
  ref: string;
}

/**
 * Fetch the contents of a single file at a given ref via the contents API.
 * Returns the decoded UTF-8 string.
 */
export async function getFileContents(params: GetFileContentsParams): Promise<string> {
  const res = await params.octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
    owner: params.owner,
    repo: params.repo,
    path: params.path,
    ref: params.ref,
  });
  const data = res.data as
    | { type?: string; encoding?: string; content?: string }
    | Array<unknown>
    | undefined;
  if (Array.isArray(data)) {
    throw new Error(`expected a file at ${params.path}, got a directory listing`);
  }
  if (!data || data.type !== 'file' || typeof data.content !== 'string') {
    throw new Error(`unexpected response shape for contents of ${params.path}`);
  }
  const encoding = data.encoding ?? 'base64';
  if (encoding !== 'base64') {
    throw new Error(`unsupported content encoding '${encoding}' for ${params.path}`);
  }
  // GitHub returns base64 with embedded newlines; Buffer handles those fine.
  return Buffer.from(data.content, 'base64').toString('utf8');
}
