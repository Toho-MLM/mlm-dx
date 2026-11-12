import { defineConfig } from 'vite'
import vinext from 'vinext'
import { cloudflare } from '@cloudflare/vite-plugin'

export default defineConfig({
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
      // Keep the existing local D1/DO data and migration/seed commands usable.
      persistState: { path: '../worker/.wrangler/state' },
    }),
  ],
})
