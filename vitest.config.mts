import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: {
    // Absolute path: Vite does not resolve relative alias targets against the config file.
    alias: { 'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    include: [
      'lib/**/*.test.ts',
      'lib/**/*.test.tsx',
      'db/**/*.test.ts',
      'components/**/*.test.tsx',
      'data/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
    exclude: ['node_modules', '.next', 'tests/e2e/**'],
    setupFiles: ['./tests/setup.ts'],
    typecheck: {
      enabled: true,
      include: ['**/*.test-d.ts'],
    },
    coverage: {
      provider: 'v8',
      include: ['lib/**'],
      exclude: ['lib/**/*.test.ts', 'lib/**/*.test-d.ts', 'lib/supabase/**', 'lib/llm/client.ts', 'lib/env/**'],
      thresholds: { lines: 90 },
    },
  },
});
