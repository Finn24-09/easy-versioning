import { Octokit } from '@octokit/rest';

export interface GetLabelsParams {
  octokit: Pick<Octokit, 'request'>;
  owner: string;
  repo: string;
  sha: string;
}

export async function getLabelsForCommit(params: GetLabelsParams): Promise<string[]> {
  const res = await params.octokit.request('GET /repos/{owner}/{repo}/commits/{commit_sha}/pulls', {
    owner: params.owner,
    repo: params.repo,
    commit_sha: params.sha,
  });
  const all = new Set<string>();
  for (const pr of res.data as Array<{ labels: Array<{ name: string }> }>) {
    for (const l of pr.labels) all.add(l.name);
  }
  return [...all];
}
