"use client";

import { useState } from "react";
import { useAuth } from "@/lib/useAuth";

interface AuthModalProps {
  onClose: () => void;
}

type View = "login" | "register" | "forgot" | "reset" | "done";

export default function AuthModal({ onClose }: AuthModalProps) {
  const { login, register } = useAuth();
  const [view, setView] = useState<View>("login");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Login
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register
  const [regUsername, setRegUsername] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");

  // Forgot / Reset
  const [fpEmail, setFpEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  function switchView(v: View) { setView(v); setError(""); }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(loginIdentifier, loginPassword);
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

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fpEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send reset code");
      switchView("reset");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reset code");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmNewPassword) { setError("Passwords do not match"); return; }
    if (newPassword.length < 6) { setError("Password must be at least 6 characters"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fpEmail, code: resetCode, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to reset password");
      switchView("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
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

        {/* Tab switcher — only on login/register views */}
        {(view === "login" || view === "register") && (
          <div className="flex gap-1 p-1 bg-surface-3 rounded-lg mb-5">
            {(["login", "register"] as const).map(t => (
              <button
                key={t}
                onClick={() => switchView(t)}
                className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  view === t ? "bg-brand text-black" : "text-muted hover:text-white"
                }`}
              >
                {t === "login" ? "Login" : "Register"}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* ── Login ── */}
        {view === "login" && (
          <form onSubmit={handleLogin} className="flex flex-col gap-3">
            <input
              type="text"
              placeholder="Email or Username"
              value={loginIdentifier}
              onChange={e => setLoginIdentifier(e.target.value)}
              required
              className={inputCls}
            />
            <input
              type="password"
              placeholder="Password"
              value={loginPassword}
              onChange={e => setLoginPassword(e.target.value)}
              required
              className={inputCls}
            />
            <button
              type="submit"
              disabled={submitting}
              className="mt-1 py-2.5 rounded-lg bg-brand hover:bg-brand-dim text-black font-semibold text-sm disabled:opacity-50 transition-colors"
            >
              {submitting ? "Logging in…" : "Login"}
            </button>
            <button
              type="button"
              onClick={() => switchView("forgot")}
              className="text-xs text-muted hover:text-brand transition-colors text-center"
            >
              Forgot password?
            </button>
          </form>
        )}

        {/* ── Register ── */}
        {view === "register" && (
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

        {/* ── Forgot password ── */}
        {view === "forgot" && (
          <form onSubmit={handleForgot} className="flex flex-col gap-3">
            <p className="text-muted text-xs mb-1">Enter your email and we&apos;ll send a 6-digit reset code.</p>
            <input
              type="email"
              placeholder="Email"
              value={fpEmail}
              onChange={e => setFpEmail(e.target.value)}
              required
              className={inputCls}
            />
            <button
              type="submit"
              disabled={submitting}
              className="mt-1 py-2.5 rounded-lg bg-brand hover:bg-brand-dim text-black font-semibold text-sm disabled:opacity-50 transition-colors"
            >
              {submitting ? "Sending…" : "Send Reset Code"}
            </button>
            <button type="button" onClick={() => switchView("login")} className="text-xs text-muted hover:text-white transition-colors text-center">
              ← Back to login
            </button>
          </form>
        )}

        {/* ── Reset password ── */}
        {view === "reset" && (
          <form onSubmit={handleReset} className="flex flex-col gap-3">
            <p className="text-muted text-xs mb-1">Check your email for the 6-digit code and enter it below.</p>
            <input
              type="text"
              placeholder="6-digit code"
              value={resetCode}
              onChange={e => setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              required
              inputMode="numeric"
              className={`${inputCls} tracking-widest text-center font-mono text-lg`}
            />
            <input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              className={inputCls}
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmNewPassword}
              onChange={e => setConfirmNewPassword(e.target.value)}
              required
              className={inputCls}
            />
            <button
              type="submit"
              disabled={submitting}
              className="mt-1 py-2.5 rounded-lg bg-brand hover:bg-brand-dim text-black font-semibold text-sm disabled:opacity-50 transition-colors"
            >
              {submitting ? "Resetting…" : "Reset Password"}
            </button>
            <button type="button" onClick={() => switchView("forgot")} className="text-xs text-muted hover:text-white transition-colors text-center">
              ← Resend code
            </button>
          </form>
        )}

        {/* ── Done ── */}
        {view === "done" && (
          <div className="flex flex-col items-center gap-4 py-4">
            <span className="text-4xl">✓</span>
            <p className="text-white font-semibold">Password updated!</p>
            <p className="text-muted text-sm text-center">You can now log in with your new password.</p>
            <button
              onClick={() => switchView("login")}
              className="py-2.5 px-6 rounded-lg bg-brand hover:bg-brand-dim text-black font-semibold text-sm transition-colors"
            >
              Go to Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
