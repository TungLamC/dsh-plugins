import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    projects: [
      {
        extends: true,
        test: {
          name: 'plugins',
          include: ['*/tests/**/*.test.ts'],
          exclude: ['native-harness/**', '**/node_modules/**'],
        },
      },
      {
        // native-harness's tests drive fake harnesses on real timers (fixed waits of
        // tens to hundreds of ms); run its files one at a time so other files' load
        // does not stretch those waits.
        extends: true,
        test: {
          name: 'native-harness',
          include: ['native-harness/tests/**/*.test.ts'],
          fileParallelism: false,
        },
      },
    ],
  },
})
