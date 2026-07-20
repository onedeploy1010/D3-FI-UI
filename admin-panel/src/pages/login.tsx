import { useState, FormEvent } from "react";
import { useLocation } from "wouter";
import { useAdminAuth } from "@/contexts/admin-auth";
import { motion } from "framer-motion";

export default function LoginPage() {
  const { requestOtp, verifyOtp } = useAdminAuth();
  const [, navigate] = useLocation();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSendCode(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await requestOtp(email);
      setStep("code");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "发送验证码失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await verifyOtp(email, code);
      navigate("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "验证码错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 relative overflow-hidden">

      {/* ── 动感背景光层 ── */}
      <div className="absolute inset-0 pointer-events-none">
        {/* 主光晕 — 中央偏上，金色大球 */}
        <motion.div
          className="absolute rounded-full"
          style={{
            width: 600,
            height: 600,
            background: "radial-gradient(circle, rgba(251,191,36,0.10) 0%, rgba(217,119,6,0.05) 40%, transparent 70%)",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -60%)",
          }}
          animate={{ scale: [1, 1.15, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* 左侧漂移光 */}
        <motion.div
          className="absolute rounded-full"
          style={{
            width: 300,
            height: 300,
            background: "radial-gradient(circle, rgba(251,191,36,0.08) 0%, transparent 70%)",
            top: "20%",
            left: "10%",
          }}
          animate={{ x: [0, 40, 0], y: [0, 30, 0], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* 右侧漂移光 */}
        <motion.div
          className="absolute rounded-full"
          style={{
            width: 250,
            height: 250,
            background: "radial-gradient(circle, rgba(217,119,6,0.07) 0%, transparent 70%)",
            top: "30%",
            right: "8%",
          }}
          animate={{ x: [0, -35, 0], y: [0, 40, 0], opacity: [0.3, 0.65, 0.3] }}
          transition={{ duration: 13, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        />
        {/* 底部辉光 */}
        <motion.div
          className="absolute rounded-full"
          style={{
            width: 400,
            height: 200,
            background: "radial-gradient(ellipse, rgba(251,191,36,0.06) 0%, transparent 70%)",
            bottom: "10%",
            left: "50%",
            transform: "translateX(-50%)",
          }}
          animate={{ opacity: [0.3, 0.6, 0.3], scaleX: [1, 1.2, 1] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        />
        {/* 细扫描线 */}
        <motion.div
          className="absolute left-0 right-0"
          style={{
            height: "1px",
            background: "linear-gradient(90deg, transparent 0%, rgba(251,191,36,0.2) 25%, rgba(251,191,36,0.5) 50%, rgba(251,191,36,0.2) 75%, transparent 100%)",
            top: "38%",
          }}
          animate={{ opacity: [0, 0.8, 0], scaleX: [0.4, 1, 0.4] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
        />
      </div>

      {/* ── 内容区 ── */}
      <div className="w-full max-w-sm relative z-10">
        <div className="mb-10 text-center">
          {/* Logo with glow ring */}
          <motion.div
            className="inline-flex items-center gap-2.5 mb-5"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <div className="relative">
              {/* Pulsing glow ring behind logo */}
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{ background: "radial-gradient(circle, rgba(251,191,36,0.4) 0%, transparent 70%)" }}
                animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeOut" }}
              />
              <div className="relative w-10 h-10 rounded-full bg-primary/20 border border-primary/50 flex items-center justify-center shadow-[0_0_20px_rgba(251,191,36,0.3)]">
                <span className="text-primary text-base font-bold">D3</span>
              </div>
            </div>
            <span className="text-2xl font-bold tracking-wide text-foreground">D3 Finance</span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            <h1 className="text-2xl font-bold text-foreground">管理后台</h1>
            <p className="text-muted-foreground text-sm mt-1">Admin Panel</p>
          </motion.div>
        </div>

        <motion.div
          className="bg-card border border-card-border rounded-xl p-8 shadow-lg shadow-black/30 backdrop-blur-sm"
          style={{ boxShadow: "0 0 40px rgba(251,191,36,0.06), 0 20px 40px rgba(0,0,0,0.4)" }}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
        >
          {step === "email" ? (
            <form onSubmit={handleSendCode} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">邮箱 · Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-3 py-2.5 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                  placeholder="you@example.com"
                />
                <p className="text-[11px] text-muted-foreground mt-1.5">仅限已授权的管理员邮箱，验证码将发送至此邮箱。</p>
              </div>
              {error && (
                <div className="text-destructive text-sm text-center bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {loading ? "发送中..." : "发送验证码 · Send code"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="space-y-5">
              <div className="text-xs text-muted-foreground text-center">
                验证码已发送至 <span className="text-foreground font-medium">{email}</span>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">验证码 · Code</label>
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  required
                  autoFocus
                  maxLength={8}
                  className="w-full px-3 py-2.5 rounded-lg bg-input border border-border text-foreground text-center tracking-[0.4em] font-mono placeholder:tracking-normal placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-lg"
                  placeholder="8 位验证码"
                />
              </div>
              {error && (
                <div className="text-destructive text-sm text-center bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading || code.length < 6}
                className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {loading ? "验证中..." : "登录 · Verify"}
              </button>
              <button
                type="button"
                onClick={() => { setStep("email"); setCode(""); setError(""); }}
                className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                ← 返回修改邮箱
              </button>
            </form>
          )}
        </motion.div>
      </div>
    </div>
  );
}
