import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { Redirect } from "wouter";
import { supabase } from "@/lib/supabase";

/**
 * Admin auth — fully delegated to Supabase Auth (2026-05-01).
 *
 * Flow:
 *   1. login(username, password) → `supabase.auth.signInWithPassword({ email })`
 *      where email = `${username}@rune.local` (synthetic domain so user can
 *      keep typing "superadmin" instead of "superadmin@rune.local").
 *   2. On success, query `admin_users` for the row joined to the just-issued
 *      auth.users.id → grab role + permissions for client-side gating.
 *   3. Persist nothing manually; supabase-js handles the session cookie /
 *      refresh token automatically. We only mirror role + permissions in
 *      React state for hasPermission().
 *   4. RLS on admin_users uses `auth.uid() = user_id` so even a tampered
 *      client can't read another admin's permissions.
 *
 * The legacy `/api/admin/login` fallback is removed — Supabase Auth is now
 * the single source of truth for admin identity.
 */
export type AdminRole = "superadmin" | "admin" | "support";

interface AdminUser {
  username: string;
  email: string;
  role: AdminRole;
  permissions: string[];
}

interface AdminAuthContextType {
  user: AdminUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isLoggedIn: boolean;
  hasPermission: (key: string) => boolean;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

/** Synthetic email domain — admins type a short username; we append this to
 *  satisfy Supabase Auth's email requirement without making them remember
 *  the full string. */
const AUTH_DOMAIN = "@d3.local";

async function loadAdminProfile(authUserId: string, fallbackEmail: string): Promise<AdminUser | null> {
  const { data, error } = await supabase
    .from("admin_users")
    .select("username, role, permissions")
    .eq("user_id", authUserId)
    .maybeSingle();
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[admin-auth] failed to load admin_users profile", error);
    return null;
  }
  if (!data) return null;
  return {
    username: (data.username as string) ?? fallbackEmail.split("@")[0],
    email: fallbackEmail,
    role: ((data.role as AdminRole) ?? "admin"),
    permissions: Array.isArray(data.permissions) ? (data.permissions as string[]) : [],
  };
}

const STORAGE_KEY = "d3-admin-supabase-auth";

/** Drop the persisted Supabase session from localStorage. Called when we
 *  detect the stored access token is dead (refresh failed, getSession
 *  returns null with a stale entry still on disk) — without this, the
 *  next page refresh repeats the same broken-bootstrap-then-drop cycle
 *  and the user is stuck logged-out-but-can't-relog until they manually
 *  clear browser storage. */
function purgeStoredSession(): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore quota / privacy-mode errors */ }
}

/** Synchronously read the persisted Supabase session from localStorage and
 *  reconstruct a minimal AdminUser. Skips the async getSession() round-
 *  trip that was sometimes hanging on slow / blocked networks (a hung
 *  await left the provider stuck on `loading=true` forever). The async
 *  enrichment (full role + permissions from admin_users) still runs in
 *  the background; the user just doesn't have to stare at a spinner
 *  while it does.
 */
function bootstrapUserFromLocalStorage(): AdminUser | null {
  try {
    const raw = typeof localStorage !== "undefined"
      ? localStorage.getItem(STORAGE_KEY)
      : null;
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (!j || typeof j !== "object") return null;
    const nowSec = Math.floor(Date.now() / 1000);
    // Defensive: only honour entries that carry a numeric expires_at AND
    // it's in the future. A missing/garbled expires_at means the schema
    // drifted (supabase-js bump, manual storage edit) and we shouldn't
    // pretend the user is logged-in — falling back to the async path is
    // safer than rendering against an unknown token.
    if (typeof j.expires_at !== "number") return null;
    if (j.expires_at <= nowSec) return null;
    const email = j?.user?.email;
    if (!email) return null;
    // user_metadata.role is set when we created the auth user — reuse it
    // as a baseline; the background load swaps in the canonical role +
    // full permissions from admin_users.
    const role = (j?.user?.user_metadata?.role as AdminRole) ?? "admin";
    return {
      username: email.split("@")[0],
      email,
      role,
      permissions: [], // hydrated later
    };
  } catch {
    return null;
  }
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  // Bootstrap synchronously from localStorage so the first render already
  // knows whether we have a session. RequireAdmin renders children
  // immediately if so — no loading flash, no race-condition redirect.
  const [user, setUser] = useState<AdminUser | null>(() => bootstrapUserFromLocalStorage());
  const [loading, setLoading] = useState(false);

  // Background enrichment: fetch the full admin_users profile (real
  // permissions, real role) and replace the bootstrapped placeholder.
  // If the session turns out to be invalid (Supabase rejects it), fall
  // back to logged-out state — and purge the dead token so the next page
  // refresh doesn't replay the same broken-bootstrap loop.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        let session = (await supabase.auth.getSession()).data.session;
        // `getSession()` may return null when the access token has expired
        // and auto-refresh didn't fire (network blip, app was backgrounded
        // past the refresh window). One explicit `refreshSession()` is
        // cheap and rescues the session in the common case — without it
        // we were dropping the user the moment they refreshed the page
        // after their access token rotated (2026-05-23 incident).
        if (!session?.user) {
          try {
            const refreshed = await supabase.auth.refreshSession();
            session = refreshed.data.session ?? null;
          } catch {
            session = null;
          }
        }
        if (!active) return;
        if (!session?.user) {
          // Genuinely no session — but localStorage may still hold a stale
          // entry (whose expires_at lied or whose refresh token has been
          // revoked server-side). Wipe it so the next refresh starts
          // clean instead of looping through "bootstrap → drop → broken
          // queries" and forcing the operator to manually clear cache.
          purgeStoredSession();
          setUser(null);
          return;
        }
        const profile = await loadAdminProfile(session.user.id, session.user.email ?? "");
        if (!active) return;
        if (profile) setUser(profile);
        // If profile is null (no admin_users row), keep the bootstrapped
        // user so the UI stays usable — they just have no extra perms
        // beyond their role baseline.
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[admin-auth] background enrichment failed", err);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!active) return;
      try {
        if (!session?.user) {
          // Same purge as the initial enrichment path — keeps "broken
          // token still on disk" from surviving a SIGNED_OUT / TOKEN_REFRESHED
          // failure event.
          purgeStoredSession();
          setUser(null);
          return;
        }
        const profile = await loadAdminProfile(session.user.id, session.user.email ?? "");
        if (active && profile) setUser(profile);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[admin-auth] auth-change handler failed", err);
      }
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    // Accept either bare "superadmin" or full "user@domain". Map bare to
    // the synthetic AUTH_DOMAIN so existing admin habits don't change.
    const email = username.includes("@") ? username : `${username}${AUTH_DOMAIN}`;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message || "Login failed");
    if (!data.user) throw new Error("Login returned no user");
    const profile = await loadAdminProfile(data.user.id, data.user.email ?? email);
    if (!profile) {
      // Auth succeeded but no admin_users row — block access. Sign out
      // so the orphan session doesn't sit around.
      await supabase.auth.signOut();
      throw new Error("Account is not authorised for the admin panel");
    }
    setUser(profile);
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  const hasPermission = useCallback(
    (key: string) => {
      if (!user) return false;
      if (user.role === "superadmin") return true;
      return user.permissions.includes(key);
    },
    [user],
  );

  return (
    <AdminAuthContext.Provider value={{ user, loading, login, logout, isLoggedIn: !!user, hasPermission }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth outside provider");
  return ctx;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isLoggedIn, loading } = useAdminAuth();
  if (loading) return <SessionRestoreScreen />;
  if (!isLoggedIn) return <NotLoggedInScreen />;
  return <>{children}</>;
}

/** On-screen diagnostic for the session-restore window. Reads localStorage
 *  directly (bypasses Supabase JS) to surface exactly what's persisted, so
 *  we don't need browser DevTools to know whether a refresh has lost the
 *  token. */
function SessionRestoreScreen() {
  const dbg = readSessionDebugInfo();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 text-center">
      <div className="text-foreground text-sm mb-4">正在恢复会话…</div>
      <details className="text-[11px] text-muted-foreground max-w-md">
        <summary className="cursor-pointer">点击查看诊断 (debug)</summary>
        <pre className="text-left mt-2 overflow-x-auto">{JSON.stringify(dbg, null, 2)}</pre>
      </details>
    </div>
  );
}

/** Replaces the silent <Redirect to="/login" /> with a visible state so
 *  users can SEE that they were treated as logged-out, with reasons. */
function NotLoggedInScreen() {
  const dbg = readSessionDebugInfo();
  // If the storage entry is missing or expired, redirect — that's the
  // legitimate "go log in" path. If it IS present but our profile load
  // failed, surface the reason instead of looping back to login.
  if (!dbg.hasStorageEntry || dbg.tokenExpired) {
    return <Redirect to="/login" />;
  }
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 text-center">
      <div className="text-amber-300 text-sm font-semibold mb-2">会话存在但加载失败</div>
      <p className="text-[12px] text-muted-foreground max-w-sm mb-4">
        Token 在 localStorage 里，但读 admin_users 没拿到角色。<br />
        可能是 RLS 或 admin_users 行不匹配。诊断如下：
      </p>
      <pre className="text-[10px] text-left text-muted-foreground bg-muted/30 px-3 py-2 rounded max-w-md overflow-x-auto">
        {JSON.stringify(dbg, null, 2)}
      </pre>
      <div className="flex gap-2 mt-4">
        <a href="/login" className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs">重新登录</a>
        <button
          onClick={() => { purgeStoredSession(); location.href = "/login"; }}
          className="px-3 py-1.5 rounded border border-border text-xs"
        >清缓存 + 重登</button>
      </div>
    </div>
  );
}

interface SessionDebug {
  hasStorageEntry: boolean;
  storageKey: string;
  email: string | null;
  userId: string | null;
  tokenExpired: boolean;
  expiresInSeconds: number | null;
  storageRaw: string | null;
}

function readSessionDebugInfo(): SessionDebug {
  const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  const out: SessionDebug = {
    hasStorageEntry: !!raw,
    storageKey: STORAGE_KEY,
    email: null,
    userId: null,
    tokenExpired: false,
    expiresInSeconds: null,
    storageRaw: raw ? `${raw.slice(0, 120)}…` : null,
  };
  if (!raw) return out;
  try {
    const j = JSON.parse(raw);
    out.email = j?.user?.email ?? null;
    out.userId = j?.user?.id ?? null;
    if (typeof j?.expires_at === "number") {
      const nowSec = Math.floor(Date.now() / 1000);
      out.expiresInSeconds = j.expires_at - nowSec;
      out.tokenExpired = j.expires_at <= nowSec;
    }
  } catch { /* ignore parse errors */ }
  return out;
}
