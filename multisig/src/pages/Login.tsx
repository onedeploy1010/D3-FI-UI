import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { useAppKit } from '@reown/appkit/react';
import { ShieldCheck, Loader2, Mail, KeyRound, ArrowLeft, Wallet } from 'lucide-react';
import { useAuth } from '@/contexts/auth';

export function Login() {
  const { requestOtp, verifyOtp } = useAuth();
  const { open } = useAppKit();
  const [mode, setMode] = useState<'choose' | 'email' | 'code'>('choose');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sendCode = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await requestOtp(email);
      setMode('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送验证码失败');
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await verifyOtp(email, code);
    } catch (err) {
      setError(err instanceof Error ? err.message : '验证码错误或已过期');
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
          <p className="text-[12px] text-[#8A2B57]/70 mt-1">合伙人 · 项目方 多方审批与签名</p>
        </div>

        {mode === 'choose' && (
          <div className="space-y-3">
            <motion.button
              type="button"
              whileTap={{ scale: 0.98 }}
              onClick={() => open()}
              className="w-full brand-card rounded-2xl p-4 flex items-center gap-3 tap text-left"
            >
              <span className="w-11 h-11 rounded-xl brand-gradient flex items-center justify-center text-white shrink-0">
                <Wallet size={20} />
              </span>
              <div className="min-w-0">
                <div className="text-[15px] font-bold text-[#160510]">合伙人 · 钱包登录</div>
                <div className="text-[11px] text-[#8A2B57]/60 mt-0.5">用 Reown 钱包连接并签名验证</div>
              </div>
            </motion.button>

            <motion.button
              type="button"
              whileTap={{ scale: 0.98 }}
              onClick={() => { setMode('email'); setError(null); }}
              className="w-full brand-card rounded-2xl p-4 flex items-center gap-3 tap text-left"
            >
              <span className="w-11 h-11 rounded-xl bg-[#8A2B57]/10 flex items-center justify-center text-[#8A2B57] shrink-0">
                <Mail size={20} />
              </span>
              <div className="min-w-0">
                <div className="text-[15px] font-bold text-[#160510]">项目方 · 邮箱验证码</div>
                <div className="text-[11px] text-[#8A2B57]/60 mt-0.5">超级合伙人用邮箱 OTP 登录</div>
              </div>
            </motion.button>
          </div>
        )}

        {mode === 'email' && (
          <form onSubmit={sendCode} className="brand-card rounded-2xl p-5 space-y-3">
            <button type="button" onClick={() => { setMode('choose'); setError(null); }} className="tap flex items-center gap-1 text-[11px] font-semibold text-[#8A2B57]/60">
              <ArrowLeft size={13} /> 返回
            </button>
            <label className="text-[11px] font-semibold text-[#8A2B57]/70">邮箱</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A2B57]/40" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                inputMode="email"
                className="w-full pl-9 pr-3.5 py-3 rounded-xl bg-white/70 border border-[#8A2B57]/12 outline-none text-[15px] text-[#160510] focus:border-[#E0568F]/50"
                placeholder="you@example.com"
              />
            </div>
            {error && <div className="text-[12px] text-red-500 font-medium">{error}</div>}
            <motion.button
              type="submit"
              whileTap={{ scale: 0.98 }}
              disabled={busy || !email.trim()}
              className="w-full py-3.5 rounded-xl brand-gradient text-white font-bold text-[15px] flex items-center justify-center gap-2 disabled:opacity-50 tap"
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : '发送验证码'}
            </motion.button>
          </form>
        )}

        {mode === 'code' && (
          <form onSubmit={verify} className="brand-card rounded-2xl p-5 space-y-3">
            <button type="button" onClick={() => { setMode('email'); setError(null); setCode(''); }} className="tap flex items-center gap-1 text-[11px] font-semibold text-[#8A2B57]/60">
              <ArrowLeft size={13} /> 换邮箱
            </button>
            <div className="text-[12px] text-[#8A2B57]/70">
              验证码已发送到 <span className="font-bold text-[#160510]">{email}</span>
            </div>
            <label className="text-[11px] font-semibold text-[#8A2B57]/70">8 位验证码</label>
            <div className="relative">
              <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A2B57]/40" />
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                inputMode="numeric"
                autoFocus
                className="w-full pl-9 pr-3.5 py-3 rounded-xl bg-white/70 border border-[#8A2B57]/12 outline-none text-lg font-bold tracking-[0.28em] text-center text-[#160510] focus:border-[#E0568F]/50"
                placeholder="••••••••"
              />
            </div>
            {error && <div className="text-[12px] text-red-500 font-medium">{error}</div>}
            <motion.button
              type="submit"
              whileTap={{ scale: 0.98 }}
              disabled={busy || code.length < 8}
              className="w-full py-3.5 rounded-xl brand-gradient text-white font-bold text-[15px] flex items-center justify-center gap-2 disabled:opacity-50 tap"
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : '验证登录'}
            </motion.button>
            <button type="button" onClick={() => void sendCode(new Event('submit') as unknown as FormEvent)} disabled={busy} className="tap w-full text-[11px] font-semibold text-[#8A2B57]/60 py-1">
              没收到？重新发送
            </button>
          </form>
        )}

        <p className="text-center text-[10px] text-[#8A2B57]/45 mt-4">
          合伙人用钱包登录 · 项目方用授权邮箱验证码
        </p>
      </motion.div>
    </div>
  );
}
