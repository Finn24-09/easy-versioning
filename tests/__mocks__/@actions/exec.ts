// Manual mock for @actions/exec — used in tests only.
// The real exec is only called by run() in src/main.ts, which no test invokes;
// runWithEffects gets fake effects instead. This stub exists so Jest can require() the
// module: @actions/exec v3 is ESM-only and its exports map has no "require" condition.
export const exec = async (
  _commandLine: string,
  _args?: string[],
  _options?: object
): Promise<number> => {
  throw new Error(
    'Real @actions/exec must not be called in tests — runWithEffects gets fake effects'
  );
};
