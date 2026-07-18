import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/auth';

export function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-frame flex flex-col items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl brand-gradient text-white mb-3">
            <ShieldCheck size={26} />
          </div>
          <h1 className="text-xl font-extrabold tracking-tight text-[#160510]">D3 多签系统</h1>
          <p className="text-[12px] text-[#8A2B57]/70 mt-1">项目方 · 超级合伙人 登录</p>
        </div>

        <form onSubmit={onSubmit} className="brand-card rounded-2xl p-5 space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-[#8A2B57]/70">用户名</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              className="w-full mt-1 px-3.5 py-3 rounded-xl bg-white/70 border border-[#8A2B57]/12 outline-none text-[15px] text-[#160510] focus:border-[#E0568F]/50"
              placeholder="superadmin"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-[#8A2B57]/70">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full mt-1 px-3.5 py-3 rounded-xl bg-white/70 border border-[#8A2B57]/12 outline-none text-[15px] text-[#160510] focus:border-[#E0568F]/50"
              placeholder="••••••••"
            />
          </div>

          {error && <div className="text-[12px] text-red-500 font-medium">{error}</div>}

          <motion.button
            type="submit"
            whileTap={{ scale: 0.98 }}
            disabled={busy || !username || !password}
            className="w-full py-3.5 rounded-xl brand-gradient text-white font-bold text-[15px] flex items-center justify-center gap-2 disabled:opacity-50 tap"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : '登录'}
          </motion.button>
        </form>

        <p className="text-center text-[10px] text-[#8A2B57]/45 mt-4">
          用 Supabase Auth 登录 · 合伙人端后期开放
        </p>
      </motion.div>
    </div>
  );
}
