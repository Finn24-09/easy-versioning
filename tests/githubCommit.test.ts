import { createSignedCommit, CommitConflictError, GraphQLClient } from '../src/githubCommit';

describe('createSignedCommit: happy path', () => {
  it('builds the correct mutation input and returns the new commit SHA', async () => {
    const calls: Array<{ query: string; variables: Record<string, unknown> }> = [];
    const client: GraphQLClient = async (query, variables) => {
      calls.push({ query, variables });
      return {
        createCommitOnBranch: { commit: { oid: 'deadbeefcafe' } },
      };
    };

    const result = await createSignedCommit({
      token: 'install-token',
      owner: 'octocat',
      repo: 'monorepo',
      branch: 'main',
      expectedHeadOid: 'parent-sha',
      headline: 'chore(release): bump versions [skip ci]',
      body: '- packages/ui: 26.5.9 -> 26.5.10',
      additions: [{ path: 'packages/ui/package.json', contents: '{"version":"26.5.10"}' }],
      __graphqlClient: client,
    });

    expect(result).toEqual({ commitSha: 'deadbeefcafe' });
    expect(calls).toHaveLength(1);
    expect(calls[0].query).toMatch(/createCommitOnBranch/);

    const input = calls[0].variables.input as Record<string, unknown>;
    expect(input.branch).toEqual({
      repositoryNameWithOwner: 'octocat/monorepo',
      branchName: 'main',
    });
    expect(input.expectedHeadOid).toBe('parent-sha');
    expect(input.message).toEqual({
      headline: 'chore(release): bump versions [skip ci]',
      body: '- packages/ui: 26.5.9 -> 26.5.10',
    });
    const fileChanges = input.fileChanges as {
      additions: Array<{ path: string; contents: string }>;
    };
    expect(fileChanges.additions).toHaveLength(1);
    expect(fileChanges.additions[0].path).toBe('packages/ui/package.json');
  });

  it('omits the body when none is provided', async () => {
    const seen: Array<{ variables: Record<string, unknown> }> = [];
    const client: GraphQLClient = async (_q, variables) => {
      seen.push({ variables });
      return { createCommitOnBranch: { commit: { oid: 'abc' } } };
    };

    await createSignedCommit({
      token: 't',
      owner: 'o',
      repo: 'r',
      branch: 'main',
      expectedHeadOid: 'oid',
      headline: 'bump',
      additions: [{ path: 'package.json', contents: '{}' }],
      __graphqlClient: client,
    });

    const input = seen[0].variables.input as { message: Record<string, unknown> };
    expect(input.message).toEqual({ headline: 'bump' });
    expect('body' in input.message).toBe(false);
  });

  it('base64-encodes the file contents', async () => {
    let captured: Record<string, unknown> | undefined;
    const client: GraphQLClient = async (_q, variables) => {
      captured = variables.input as Record<string, unknown>;
      return { createCommitOnBranch: { commit: { oid: 'x' } } };
    };

    const contents = '{"name":"ui","version":"26.5.10"}\n';
    await createSignedCommit({
      token: 't',
      owner: 'o',
      repo: 'r',
      branch: 'main',
      expectedHeadOid: 'oid',
      headline: 'bump',
      additions: [{ path: 'packages/ui/package.json', contents }],
      __graphqlClient: client,
    });

    const fileChanges = captured!.fileChanges as {
      additions: Array<{ path: string; contents: string }>;
    };
    const encoded = fileChanges.additions[0].contents;
    expect(encoded).toBe(Buffer.from(contents, 'utf8').toString('base64'));
    expect(Buffer.from(encoded, 'base64').toString('utf8')).toBe(contents);
  });

  it('encodes UTF-8 byte sequences correctly', async () => {
    let captured: Record<string, unknown> | undefined;
    const client: GraphQLClient = async (_q, variables) => {
      captured = variables.input as Record<string, unknown>;
      return { createCommitOnBranch: { commit: { oid: 'x' } } };
    };
    const contents = '{"name":"emoji","tag":"v1-naïve-\u{1F389}"}';
    await createSignedCommit({
      token: 't',
      owner: 'o',
      repo: 'r',
      branch: 'main',
      expectedHeadOid: 'oid',
      headline: 'bump',
      additions: [{ path: 'p.json', contents }],
      __graphqlClient: client,
    });
    const fileChanges = captured!.fileChanges as {
      additions: Array<{ path: string; contents: string }>;
    };
    expect(Buffer.from(fileChanges.additions[0].contents, 'base64').toString('utf8')).toBe(
      contents
    );
  });
});

describe('createSignedCommit: conflict detection', () => {
  it('throws CommitConflictError when GraphQL reports an expectedHeadOid mismatch', async () => {
    const client: GraphQLClient = async () => {
      const err = new Error(
        "Required input 'expectedHeadOid' was 'oldSha', but the branch head is 'newSha'"
      );
      throw err;
    };
    await expect(
      createSignedCommit({
        token: 't',
        owner: 'o',
        repo: 'r',
        branch: 'main',
        expectedHeadOid: 'oldSha',
        headline: 'bump',
        additions: [{ path: 'p.json', contents: '{}' }],
        __graphqlClient: client,
      })
    ).rejects.toBeInstanceOf(CommitConflictError);
  });

  it('detects conflicts surfaced via the errors[] array on a GraphqlResponseError', async () => {
    const client: GraphQLClient = async () => {
      const err = Object.assign(new Error('Request failed'), {
        errors: [{ message: 'expectedHeadOid does not match', type: 'STALE_DATA' }],
      });
      throw err;
    };
    await expect(
      createSignedCommit({
        token: 't',
        owner: 'o',
        repo: 'r',
        branch: 'main',
        expectedHeadOid: 'oid',
        headline: 'bump',
        additions: [{ path: 'p.json', contents: '{}' }],
        __graphqlClient: client,
      })
    ).rejects.toBeInstanceOf(CommitConflictError);
  });

  it('rethrows unrelated errors unchanged', async () => {
    const original = new Error('Unauthorized: bad credentials');
    const client: GraphQLClient = async () => {
      throw original;
    };
    await expect(
      createSignedCommit({
        token: 't',
        owner: 'o',
        repo: 'r',
        branch: 'main',
        expectedHeadOid: 'oid',
        headline: 'bump',
        additions: [{ path: 'p.json', contents: '{}' }],
        __graphqlClient: client,
      })
    ).rejects.toBe(original);
  });

  it('throws when the response has no commit OID', async () => {
    const client: GraphQLClient = async () => ({ createCommitOnBranch: null });
    await expect(
      createSignedCommit({
        token: 't',
        owner: 'o',
        repo: 'r',
        branch: 'main',
        expectedHeadOid: 'oid',
        headline: 'bump',
        additions: [{ path: 'p.json', contents: '{}' }],
        __graphqlClient: client,
      })
    ).rejects.toThrow(/no commit OID/i);
  });
});
