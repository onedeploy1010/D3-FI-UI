/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_AUTH_DOMAIN?: string;
  readonly VITE_TURNKEY_ORG_ID?: string;
  readonly VITE_TURNKEY_DASHBOARD_BASE?: string;
  readonly VITE_REOWN_PROJECT_ID?: string;
  readonly VITE_PARTNER_APP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
