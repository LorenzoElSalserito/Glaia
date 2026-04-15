import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    reporters: 'default',
  },
  resolve: {
    alias: {
      '@shared': new URL('./src/shared', import.meta.url).pathname,
    },
  },
})
