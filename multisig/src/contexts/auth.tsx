import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '@/lib/supabase';

/** Roles recognised by the multisig system. `super_partner` (项目方) and
 *  `superadmin` see the super-partner area; `partner` (later) sees the partner
 *  area. Others have no access. */
export type MsRole = 'super_partner' | 'superadmin' | 'partner' | 'none';

export type MsUser = {
  username: string;
  email: string;
  role: MsRole;
  permissions: string[];
};

type AuthCtx = {
  user: MsUser | null;
  loading: boolean;
  /** Step 1: email OTP — send a 6-digit code to the address. */
  requestOtp: (email: string) => Promise<void>;
  /** Step 2: verify the emailed code and establish the session. */
  verifyOtp: (email: string, token: string) => Promise<void>;
  logout: () => Promise<void>;
  isSuperPartner: boolean;
  isPartner: boolean;
};

const Ctx = createContext<AuthCtx | undefined>(undefined);

/** Resolve the logged-in identity's role. Super-partner is an admin_users row
 *  (set in admin-panel). Partner resolution (by wallet / 5000 stake) lands later. */
async function resolveUser(authUserId: string, email: string): Promise<MsUser> {
  const { data } = await supabase
    .from('admin_users')
    .select('username, role, permissions')
    .eq('user_id', authUserId)
    .maybeSingle();

  const role = (data?.role as string) ?? '';
  const msRole: MsRole =
    role === 'super_partner' || role === 'superadmin' ? (role as MsRole) : 'none';

  return {
    username: (data?.username as string) ?? email.split('@')[0],
    email,
    role: msRole,
    permissions: Array.isArray(data?.permissions) ? (data!.permissions as string[]) : [],
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MsUser | null>(null);
  const [loading, setLoading] = useState(true);

  const hydrate = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session?.user) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setUser(await resolveUser(session.user.id, session.user.email ?? ''));
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void hydrate();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void hydrate();
    });
    return () => sub.subscription.unsubscribe();
  }, [hydrate]);

  const requestOtp = useCallback(async (email: string) => {
    // shouldCreateUser:false — only pre-seeded super-partner emails may sign in.
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: false },
    });
    if (error) throw new Error(error.message);
  }, []);

  const verifyOtp = useCallback(async (email: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: token.trim(),
      type: 'email',
    });
    if (error) throw new Error(error.message);
    await hydrate();
  }, [hydrate]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  const value: AuthCtx = {
    user,
    loading,
    requestOtp,
    verifyOtp,
    logout,
    isSuperPartner: user?.role === 'super_partner' || user?.role === 'superadmin',
    isPartner: user?.role === 'partner',
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
