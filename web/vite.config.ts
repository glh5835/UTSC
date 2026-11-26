import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { loadEnv, type UserConfig } from 'vite'
import { publicBuildConfig } from './src/lib/publicConfig.ts'
import type { DataVersionConfig } from './src/data/sources'

export function websiteConfig(mode: string, command: 'serve' | 'build', production?: {
  config: DataVersionConfig
  target: 'production' | 'staging'
  output: string
}): UserConfig {
  // The public demo rejects account configuration; development is explicit.
  const publicMode = mode === 'demo'
  if (mode === 'production' && !production) throw new Error('Use npm run build:production for a verified release')
  const connection = publicBuildConfig(loadEnv(mode, process.cwd(), 'VITE_'), publicMode, command === 'serve')
  const noIndex = production?.target !== 'production'
  // Ajv compiles the frozen shared schemas at runtime, requiring unsafe-eval.
  // No inline scripts, remote scripts, arbitrary network origins or frames.
  const csp = [
    "default-src 'none'", "script-src 'self' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'", "img-src 'self' data:", "font-src 'self'",
    `connect-src 'self'${connection.url ? ` ${new URL(connection.url).origin}` : ''}`,
    "base-uri 'none'", "form-action 'none'", "object-src 'none'",
  ].join('; ')
  return {
    // Disable automatic prefix-based exposure; explicitly inject only reviewed values.
    envPrefix: [],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(connection.url),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(connection.key),
      __UTSC_RELEASE_DATA__: production ? JSON.stringify(production.config) : 'undefined',
    },
    plugins: [react(), {
      name: 'preview-security',
      apply: 'build',
      transformIndexHtml: {
        order: 'pre',
        handler(html) {
          if (publicMode) html = html.replace('/src/main.tsx', '/src/public-main.tsx')
          if (production) html = html.replace(' Public experience preview with SYNTHETIC data; no accounts or personal saving.', '')
          if (!noIndex) html = html.replace(/\s*<meta name="robots"[^>]+>/, '')
          return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`)
        },
      },
      generateBundle() {
        const indexing = noIndex ? '  X-Robots-Tag: noindex, nofollow, noarchive\n' : ''
        this.emitFile({ type: 'asset', fileName: '_headers', source: `/*\n  Content-Security-Policy: ${csp}; frame-ancestors 'none'\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: no-referrer\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n${indexing}  Cache-Control: no-store\n` })
      },
    }],
    publicDir: production ? false as const : undefined,
    build: { sourcemap: false as const, outDir: production?.output ?? (publicMode ? 'static-dist' : 'development-dist') },
    server: {
      port: 5173,
      strictPort: false,
      // Node binds "localhost" to ::1 only, but the Auth email-confirmation
      // links use site_url http://127.0.0.1:5173 (supabase/config.toml); the
      // dev server must answer on the IPv4 loopback too or confirmation
      // breaks. Local development only.
      host: true,
      // Embedded-browser dev clients can serve stale transformed modules from
      // cache and break HMR revalidation; dev responses must never be cached.
      headers: {
        'Cache-Control': 'no-store',
      },
    },
    test: {
      environment: 'node',
      include: ['tests/**/*.test.ts'],
    },
  }
}

export default defineConfig(({ mode, command }) => websiteConfig(mode, command))
