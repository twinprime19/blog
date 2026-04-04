import { defineConfig } from 'vitest/config';
import { join } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false,
    include: ['tests/**/*.test.js'],
    globalSetup: 'tests/global-setup.js',
    env: {
      CONTENT_DIR: join(process.cwd(), '.test-content'),
      DATA_DIR: join(process.cwd(), '.test-data'),
      GITHUB_WEBHOOK_SECRET: 'test-webhook-secret',
    },
  },
});
