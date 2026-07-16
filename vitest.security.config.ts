import { defineConfig } from 'vitest/config';

/**
 * Dedicated config for the fund-safety security regression suite.
 * Run with: npx vitest run --config vitest.security.config.ts
 *
 * Edge functions target Deno and import via `npm:` specifiers; we alias those to
 * the installed node_modules copies and shim `Deno.*` in test/security/setup.ts.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./test/security/setup.ts'],
    include: [
      'supabase/functions/**/*.security.test.ts',
      'scripts/**/*.security.test.ts',
      'test/security/**/*.test.ts',
    ],
  },
  resolve: {
    alias: [
      { find: /^npm:@supabase\/supabase-js@2$/, replacement: '@supabase/supabase-js' },
      { find: /^npm:jose@6$/, replacement: 'jose' },
    ],
  },
});
