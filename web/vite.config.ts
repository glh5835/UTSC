import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { publicBuildConfig } from './src/lib/publicConfig'

export default defineConfig(({ mode, command }) => {
  // This release rejects account configuration in every build mode.
  const connection = publicBuildConfig(loadEnv(mode, process.cwd(), 'VITE_'), true, command === 'serve')
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
    },
    plugins: [react(), {
      name: 'preview-security',
      apply: 'build',
      transformIndexHtml(html) {
        return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`)
      },
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: '_headers', source: `/*\n  Content-Security-Policy: ${csp}; frame-ancestors 'none'\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: no-referrer\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  X-Robots-Tag: noindex, nofollow, noarchive\n  Cache-Control: no-store\n` })
      },
    }],
    build: { sourcemap: false, outDir: 'static-dist' },
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
})
