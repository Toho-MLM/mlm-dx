import { defineConfig } from 'vite'
import vinext from 'vinext'
import { cloudflare } from '@cloudflare/vite-plugin'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

const buildId = randomUUID()

export default defineConfig({
  plugins: [
    {
      name: 'mlm-dx-pwa',
      apply: 'build',
      applyToEnvironment: (environment) => environment.name === 'client',
      generateBundle() {
        const source = readFileSync(new URL('./pwa/service-worker.js', import.meta.url), 'utf8')
        this.emitFile({
          type: 'asset',
          fileName: 'sw.js',
          source: source.replace('__MLM_BUILD_ID__', buildId),
        })
      },
    },
    vinext(),
    cloudflare({
      viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
      // Keep the existing local D1/DO data and migration/seed commands usable.
      persistState: { path: '../worker/.wrangler/state' },
    }),
  ],
})
