import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    // Preserve CommonJS default wrappers so import compatibility bugs stay visible.
    deps: { interopDefault: false },
    include: ['app/**/*.test.ts', 'app/**/*.test.tsx'],
  },
})
