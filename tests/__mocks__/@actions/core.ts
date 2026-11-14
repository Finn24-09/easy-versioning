// Manual mock for @actions/core — used in tests only.
// The real functions are only called by run() in src/main.ts, which no test invokes;
// runWithEffects gets fake effects instead. This stub exists so Jest can require() the
// module: @actions/core v3 is ESM-only and its exports map has no "require" condition.
function notInTests(): never {
  throw new Error(
    'Real @actions/core must not be called in tests — runWithEffects gets fake effects'
  );
}

export const getInput = (_name: string, _options?: object): string => notInTests();
export const setSecret = (_secret: string): void => notInTests();
export const info = (_message: string): void => notInTests();
export const setFailed = (_message: string | Error): void => notInTests();
