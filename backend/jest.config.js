module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  setupFiles: ['<rootDir>/tests/setupEnv.ts'],
  testTimeout: 60000,
  globals: {},
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'commonjs', target: 'ES2022', esModuleInterop: true, strict: true, skipLibCheck: true } }] }
};
