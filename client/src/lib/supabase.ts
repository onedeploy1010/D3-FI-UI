import { createClient } from '@supabase/supabase-js';
import type { Database } from '@shared/types/database';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const isSupabaseClientConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseClientConfigured
  ? createClient<Database>(supabaseUrl!, supabaseAnonKey!)
  : null;
