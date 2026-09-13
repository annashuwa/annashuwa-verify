import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 60000,
    hookTimeout: 60000,
    sequence: { shuffle: false },
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
