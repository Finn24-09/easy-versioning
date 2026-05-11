export interface PackageConfig {
  path: string;
  triggers: string[];
}

export interface EasyVersioningConfig {
  skipLabel: string;
  timezone: string;
  ignore: string[];
  packages: PackageConfig[];
}
