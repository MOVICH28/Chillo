"use client";

import { useState } from "react";
import { useAuth } from "@/lib/useAuth";

interface AuthModalProps {
  onClose: () => void;
}

export default function AuthModal({ onClose }: AuthModalProps) {
  const { login, register } = useAuth();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [regUsername, setRegUsername] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(loginEmail, loginPassword);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (regPassword !== regConfirm) { setError("Passwords do not match"); return; }
    if (regPassword.length < 6) { setError("Password must be at least 6 characters"); return; }
    setSubmitting(true);
    try {
      await register(regUsername, regEmail, regPassword);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls = "w-full px-3 py-2 rounded-lg bg-surface-3 border border-surface-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-brand transition-colors";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface border border-surface-3 rounded-xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-white font-semibold text-lg leading-tight">Play with DORA</h2>
            <p className="text-muted text-xs mt-0.5">Virtual currency — no real money needed</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-white text-2xl leading-none w-8 h-8 flex items-center justify-center">×</button>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 p-1 bg-surface-3 rounded-lg mb-5">
          {(["login", "register"] as const).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(""); }}
              className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === t ? "bg-brand text-black" : "text-muted hover:text-white"
              }`}
            >
              {t === "login" ? "Login" : "Register"}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {tab === "login" ? (
          <form onSubmit={handleLogin} className="flex flex-col gap-3">
            <input type="email" placeholder="Email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required className={inputCls} />
            <input type="password" placeholder="Password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required className={inputCls} />
            <button
              type="submit"
              disabled={submitting}
              className="mt-1 py-2.5 rounded-lg bg-brand hover:bg-brand-dim text-black font-semibold text-sm disabled:opacity-50 transition-colors"
            >
              {submitting ? "Logging in…" : "Login"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="flex flex-col gap-3">
            <input type="text" placeholder="Username" value={regUsername} onChange={e => setRegUsername(e.target.value)} required className={inputCls} />
            <input type="email" placeholder="Email" value={regEmail} onChange={e => setRegEmail(e.target.value)} required className={inputCls} />
            <input type="password" placeholder="Password" value={regPassword} onChange={e => setRegPassword(e.target.value)} required className={inputCls} />
            <input type="password" placeholder="Confirm Password" value={regConfirm} onChange={e => setRegConfirm(e.target.value)} required className={inputCls} />
            <button
              type="submit"
              disabled={submitting}
              className="mt-1 py-2.5 rounded-lg bg-brand hover:bg-brand-dim text-black font-semibold text-sm disabled:opacity-50 transition-colors"
            >
              {submitting ? "Creating account…" : "Create Account — Get 1000 DORA"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
