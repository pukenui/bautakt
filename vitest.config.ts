import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/*/test/**/*.test.ts',
      'plugins/*/test/**/*.test.ts',
      'apps/*/test/**/*.test.ts',
    ],
    environment: 'node',
    // better-sqlite3 ist ein natives Modul → eigene Prozesse statt Worker-Threads
    pool: 'forks',
  },
});
