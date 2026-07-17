import { defineConfig } from 'vitest/config';

/**
 * Dedicated config for the fund-safety security regression suite.
 * Run with: npx vitest run --config vitest.security.config.ts
 *
 * Edge functions target Deno and import via `npm:` specifiers; we alias those to
 * the installed node_modules copies and shim `Deno.*` in test/security/setup.ts.
 */
/**
 * Deno edge code imports via `npm:pkg@ver/sub` and sometimes `https://esm.sh/...`,
 * which Node's ESM loader can't resolve. This harness plugin (TEST LOADING only):
 *   - rewrites `npm:pkg@ver/sub` -> the real installed `pkg/sub` in node_modules
 *   - stubs genuinely-remote `https:` deps to an empty module (pure helpers under
 *     test never call into them; full behavior belongs in `deno test` in CI).
 */
const denoImportShim = {
  name: 'deno-import-shim',
  enforce: 'pre' as const,
  async resolveId(this: { resolve: (s: string, i?: string, o?: { skipSelf: boolean }) => Promise<{ id: string } | null> }, id: string) {
    if (id.startsWith('https:')) return '\0deno-remote-stub';
    if (id.startsWith('npm:')) {
      // npm:viem@2/accounts -> viem/accounts ; npm:@turnkey/x@1.2 -> @turnkey/x
      const bare = id.slice(4).replace(/^(@[^/]+\/[^/@]+|[^/@]+)@[^/]+/, '$1');
      const r = await this.resolve(bare, undefined, { skipSelf: true });
      return r ? r.id : '\0deno-remote-stub';
    }
    return null;
  },
  load(id: string) {
    if (id === '\0deno-remote-stub') {
      return 'const s = new Proxy(() => s, { get: () => s }); export default s;';
    }
    return null;
  },
};

export default defineConfig({
  plugins: [denoImportShim],
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
      { find: /^npm:viem@2$/, replacement: 'viem' },
    ],
  },
});
