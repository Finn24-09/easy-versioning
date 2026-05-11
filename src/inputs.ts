export interface Inputs {
  appId: number;
  privateKey: string;
  configPath: string;
}

const DEFAULT_CONFIG_PATH = '.github/easy-versioning.yml';

export function parseInputs(raw: Record<string, string | undefined>): Inputs {
  const appIdRaw = raw['app-id'];
  if (!appIdRaw) throw new Error("missing required input 'app-id'");
  const appId = Number(appIdRaw);
  if (!Number.isFinite(appId) || appId <= 0 || !Number.isInteger(appId)) {
    throw new Error("input 'app-id' must be a positive integer (number)");
  }

  const privateKey = raw['private-key'];
  if (!privateKey) throw new Error("missing required input 'private-key'");

  const configPath = raw['config-path'] || DEFAULT_CONFIG_PATH;

  return { appId, privateKey, configPath };
}
