module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  clearMocks: true,
  verbose: false,
  moduleNameMapper: {
    '^@octokit/rest$': '<rootDir>/tests/__mocks__/@octokit/rest.ts',
    '^@octokit/graphql$': '<rootDir>/tests/__mocks__/@octokit/graphql.ts',
  },
};
