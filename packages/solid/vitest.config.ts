import solidPlugin from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [solidPlugin()],
  resolve: process.env.VITEST
    ? {
        conditions: ['browser'],
      }
    : undefined,
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['src/test-utils/setup.ts'],
  },
});
