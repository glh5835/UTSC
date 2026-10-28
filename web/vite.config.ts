import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
})
