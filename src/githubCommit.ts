import { graphql } from '@octokit/graphql';

export interface FileAddition {
  /** Repository-relative POSIX path (e.g. `packages/ui/package.json`). */
  path: string;
  /** File contents as a UTF-8 string. Will be base64-encoded internally. */
  contents: string;
}

export interface CreateSignedCommitParams {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  expectedHeadOid: string;
  headline: string;
  body?: string;
  additions: FileAddition[];
  /**
   * Test seam: override the GraphQL client used to send the mutation. When
   * omitted, `@octokit/graphql` is used, authenticated via the installation
   * token.
   */
  __graphqlClient?: GraphQLClient;
}

export type GraphQLClient = (query: string, variables: Record<string, unknown>) => Promise<unknown>;

export interface CreateSignedCommitResult {
  commitSha: string;
}

/**
 * Raised when `createCommitOnBranch` rejects the mutation because the branch
 * HEAD has moved away from `expectedHeadOid` (a concurrent push landed). The
 * caller is expected to refresh state and retry.
 */
export class CommitConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommitConflictError';
  }
}

const CREATE_COMMIT_MUTATION = `
mutation CreateSignedCommit($input: CreateCommitOnBranchInput!) {
  createCommitOnBranch(input: $input) {
    commit {
      oid
    }
  }
}
`;

interface CreateCommitOnBranchResponse {
  createCommitOnBranch?: {
    commit?: {
      oid?: string;
    } | null;
  } | null;
}

/**
 * Heuristic: GitHub's GraphQL API surfaces the stale-head condition as an
 * error message that mentions `expectedHeadOid`, "expected" + "OID", or
 * references the ref-update conflict. Anything else (auth failure, bad input,
 * rate limit) we re-raise as a regular error.
 */
function isExpectedHeadOidConflict(err: unknown): boolean {
  const messages: string[] = [];
  if (err instanceof Error && err.message) messages.push(err.message);
  const errors = (err as { errors?: Array<{ message?: string; type?: string }> })?.errors;
  if (Array.isArray(errors)) {
    for (const e of errors) {
      if (e?.message) messages.push(e.message);
      if (e?.type) messages.push(e.type);
    }
  }
  const blob = messages.join(' ').toLowerCase();
  if (!blob) return false;
  return (
    blob.includes('expectedheadoid') ||
    blob.includes('expected head oid') ||
    (blob.includes('expected') && blob.includes('oid')) ||
    blob.includes('stale') ||
    blob.includes('not match')
  );
}

export async function createSignedCommit(
  params: CreateSignedCommitParams
): Promise<CreateSignedCommitResult> {
  const additions = params.additions.map((a) => ({
    path: a.path,
    contents: Buffer.from(a.contents, 'utf8').toString('base64'),
  }));

  const input = {
    branch: {
      repositoryNameWithOwner: `${params.owner}/${params.repo}`,
      branchName: params.branch,
    },
    message: params.body
      ? { headline: params.headline, body: params.body }
      : { headline: params.headline },
    expectedHeadOid: params.expectedHeadOid,
    fileChanges: { additions },
  };

  const client: GraphQLClient =
    params.__graphqlClient ??
    (((query, variables) =>
      graphql(query, {
        ...variables,
        headers: { authorization: `token ${params.token}` },
      })) as GraphQLClient);

  let response: CreateCommitOnBranchResponse;
  try {
    response = (await client(CREATE_COMMIT_MUTATION, { input })) as CreateCommitOnBranchResponse;
  } catch (err) {
    if (isExpectedHeadOidConflict(err)) {
      throw new CommitConflictError(
        `createCommitOnBranch rejected: branch head moved past expectedHeadOid ${params.expectedHeadOid}`
      );
    }
    throw err;
  }

  const oid = response?.createCommitOnBranch?.commit?.oid;
  if (!oid) {
    throw new Error('createCommitOnBranch returned no commit OID');
  }
  return { commitSha: oid };
}
