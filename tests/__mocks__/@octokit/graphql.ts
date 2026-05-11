// Manual mock for @octokit/graphql — used in tests only.
// The real graphql function is never invoked in tests; createSignedCommit's
// __graphqlClient seam supplies a fake. This stub exists so Jest can require()
// the module without trying to parse @octokit/graphql's ESM bundle.
export const graphql = async (_query: string, _variables?: object): Promise<unknown> => {
  throw new Error('Real @octokit/graphql must not be called in tests — use __graphqlClient');
};
