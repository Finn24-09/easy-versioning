// Manual mock for @octokit/rest — used in tests only.
// The real Octokit is never instantiated in tests; __octokitFactory provides the seam.
export class Octokit {
  constructor(_opts?: unknown) {}
  async request(_route: string, _params?: object): Promise<{ data: { id: number } }> {
    throw new Error('Real Octokit.request must not be called in tests — use __octokitFactory');
  }
}
