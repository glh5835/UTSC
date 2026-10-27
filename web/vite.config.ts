import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
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
