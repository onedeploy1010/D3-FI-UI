/**
 * Vitest setup shim for auditing Supabase Edge Functions (Deno runtime) under Node.
 * Runs before any test module is imported, so module-top `Deno.env.get(...)` calls
 * in edge code resolve instead of throwing. Tests may override env via process.env.
 */
type DenoEnv = { get(key: string): string | undefined; set(key: string, v: string): void };

const denoShim = {
  env: {
    get: (key: string): string | undefined => process.env[key],
    set: (key: string, v: string): void => {
      process.env[key] = v;
    },
  } as DenoEnv,
  // Edge routers call Deno.serve at module load; make it a no-op capture.
  serve: (_handler: unknown): void => {
    /* no-op in tests */
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).Deno = (globalThis as any).Deno ?? denoShim;
