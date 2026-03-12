import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.js'],
    globalSetup: 'tests/global-setup.js',
    env: { DB_PATH: ':memory:' },
  },
});
