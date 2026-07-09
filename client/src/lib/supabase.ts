import { createClient } from '@supabase/supabase-js';
import type { Database } from '@shared/types/database';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const isSupabaseClientConfigured = Boolean(url && key);

export const supabase = isSupabaseClientConfigured
  ? createClient<Database>(url!, key!)
  : null;
