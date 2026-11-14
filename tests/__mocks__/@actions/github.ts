// Manual mock for @actions/github — used in tests only.
// The real context is only read by run() in src/main.ts, which no test invokes;
// runWithEffects gets fake effects instead. This stub exists so Jest can require() the
// module: @actions/github v9 is ESM-only and its exports map has no "require" condition.
// Any property access on context throws.
export const context: object = new Proxy(
  {},
  {
    get(): never {
      throw new Error(
        'Real @actions/github must not be called in tests — runWithEffects gets fake effects'
      );
    },
  }
);
