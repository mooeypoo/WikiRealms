import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * Absolute site origin for Open Graph / canonical / sitemap.
 * Netlify sets `URL` (and `DEPLOY_PRIME_URL` on previews). Override with
 * `VITE_SITE_ORIGIN` when building locally against a known host.
 */
function siteOrigin(mode) {
  const env = loadEnv(mode, process.cwd(), '')
  return (
    env.VITE_SITE_ORIGIN ||
    process.env.VITE_SITE_ORIGIN ||
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    'http://localhost:5173'
  ).replace(/\/$/, '')
}

function injectSiteOrigin(origin) {
  return {
    name: 'wikirealms-site-origin',
    transformIndexHtml(html) {
      return html.replaceAll('__SITE_ORIGIN__', origin)
    },
    closeBundle() {
      const outDir = join(process.cwd(), 'dist')
      for (const file of ['robots.txt', 'sitemap.xml']) {
        const path = join(outDir, file)
        try {
          const text = readFileSync(path, 'utf8')
          writeFileSync(path, text.replaceAll('__SITE_ORIGIN__', origin))
        } catch {
          // Absent when `public/` was not copied (tests / partial builds).
        }
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  const origin = siteOrigin(mode)
  return {
    plugins: [vue(), injectSiteOrigin(origin)],
    define: {
      'import.meta.env.VITE_SITE_ORIGIN': JSON.stringify(origin),
    },
    test: {
      environment: 'jsdom',
      globals: true,
      include: ['tests/**/*.test.js'],
    },
  }
})
