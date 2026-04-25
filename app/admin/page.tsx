"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

const STORAGE_KEY = "pumpdora_admin_session";

interface Outcome {
  id: string;
  label: string;
}

interface Round {
  id: string;
  question: string;
  category: string;
  status: string;
  endsAt: string;
  createdAt: string;
  totalPool: number;
  twitterUsername: string | null;
  twitterQuestion: string | null;
  outcomes: Outcome[] | null;
  winningOutcome: string | null;
  winner: string | null;
}

function timeRemaining(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return "EXPIRED";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m ${s % 60}s`;
}

function timeAgo(dateStr: string): string {
  const mins = Math.round((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const OUTCOME_COLORS: Record<string, string> = {
  A: "#f87171", B: "#fb923c", C: "#facc15",
  D: "#4ade80", E: "#38bdf8", F: "#c084fc",
  yes: "#4ade80", no: "#f87171",
};

// ── Login screen ─────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: (pw: string) => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pw.trim()) { setErr("Enter password"); return; }
    onLogin(pw.trim());
  }

  return (
    <div className="min-h-screen bg-[#0d0f14] flex items-center justify-center">
      <form onSubmit={submit} className="bg-[#13151b] border border-white/10 rounded-2xl p-8 w-full max-w-sm">
        <h1 className="text-white font-bold text-xl mb-1">Admin Panel</h1>
        <p className="text-white/40 text-sm mb-6">Pumpdora internal tools</p>
        <label className="block text-white/60 text-xs mb-1">Password</label>
        <input
          type="password"
          value={pw}
          onChange={e => { setPw(e.target.value); setErr(""); }}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm mb-1 focus:outline-none focus:border-purple-500"
          placeholder="Admin password"
          autoFocus
        />
        {err && <p className="text-red-400 text-xs mb-3">{err}</p>}
        <button
          type="submit"
          className="mt-4 w-full py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm transition-colors"
        >
          Login
        </button>
      </form>
    </div>
  );
}

// ── Twitter round card ────────────────────────────────────────────────────────

function TwitterRoundCard({
  round, password, onResolved,
}: {
  round: Round;
  password: string;
  onResolved: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const outcomes = round.outcomes ?? [];
  const isExpired = new Date(round.endsAt) < new Date();

  async function resolve() {
    if (!selected) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundId: round.id, winningOutcome: selected, adminPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed"); setLoading(false); return; }
      setSuccess(`Resolved! Winner: ${selected}`);
      setTimeout(onResolved, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`rounded-xl border bg-[#13151b] p-4 ${isExpired ? "border-red-500/40" : "border-white/8"}`}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-full bg-[#1d9bf0]/15 border border-[#1d9bf0]/30 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-[#1d9bf0]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.858L1.808 2.25h6.946l4.258 5.63 5.232-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <a
              href={`https://twitter.com/${round.twitterUsername}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white font-semibold text-sm hover:text-[#1d9bf0] transition-colors"
            >
              @{round.twitterUsername}
            </a>
            {isExpired && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 font-semibold">
                EXPIRED
              </span>
            )}
          </div>
          <p className="text-white/50 text-xs truncate">{round.question}</p>
        </div>
        <div className="text-right shrink-0">
          <span className={`text-xs font-mono font-semibold ${isExpired ? "text-red-400" : "text-yellow-400"}`}>
            {timeRemaining(round.endsAt)}
          </span>
          <p className="text-white/30 text-[10px]">{timeAgo(round.createdAt)}</p>
        </div>
      </div>

      {/* Question type */}
      <div className="mb-3">
        <span className="text-[11px] text-white/40 bg-white/5 px-2 py-0.5 rounded">
          {round.twitterQuestion === "posts_count" ? "📊 Posts count" : "⏱ Next post time"}
        </span>
      </div>

      {/* Outcome selector */}
      <div className="grid grid-cols-3 gap-1.5 mb-3">
        {outcomes.map(o => {
          const color = OUTCOME_COLORS[o.id] ?? "#888";
          const isSelected = selected === o.id;
          return (
            <button
              key={o.id}
              onClick={() => { setSelected(o.id); setConfirming(true); setError(""); setSuccess(""); }}
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-[11px] transition-all"
              style={{
                background:   isSelected ? `${color}20` : "rgba(255,255,255,0.03)",
                borderColor:  isSelected ? color : "rgba(255,255,255,0.08)",
                color:        isSelected ? color : "rgba(255,255,255,0.6)",
              }}
            >
              <span className="font-bold" style={{ color }}>{o.id}</span>
              <span className="truncate">{o.label}</span>
            </button>
          );
        })}
      </div>

      {/* Confirm bar */}
      {confirming && selected && !success && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white/5 border border-white/10">
          <span className="text-white/60 text-xs flex-1">
            Resolve with <span className="font-bold text-white">{selected}</span>?
          </span>
          <button
            onClick={() => { setConfirming(false); setSelected(null); }}
            className="px-2.5 py-1 rounded text-xs text-white/40 hover:text-white border border-white/10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={resolve}
            disabled={loading}
            className="px-3 py-1 rounded text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white transition-colors disabled:opacity-50"
          >
            {loading ? "Resolving…" : "Confirm"}
          </button>
        </div>
      )}

      {error  && <p className="text-red-400 text-xs mt-2">{error}</p>}
      {success && <p className="text-green-400 text-xs mt-2 font-semibold">{success}</p>}
    </div>
  );
}

// ── Generic round row ─────────────────────────────────────────────────────────

function RoundRow({
  round, password, onResolved,
}: {
  round: Round;
  password: string;
  onResolved: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");

  const outcomes = round.outcomes ?? [];
  const isExpired = new Date(round.endsAt) < new Date();

  const resolveOptions: string[] = outcomes.length > 0
    ? outcomes.map(o => o.id)
    : ["yes", "no"];

  async function resolve() {
    if (!selected) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundId: round.id, winningOutcome: selected, adminPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed"); setLoading(false); return; }
      setSuccess(`Resolved: ${selected}`);
      setTimeout(onResolved, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`border-b border-white/5 py-3 px-4 ${isExpired ? "bg-red-500/5" : ""}`}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-white text-xs font-medium truncate">{round.question}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[10px] px-1.5 py-px rounded ${
              round.category === "twitter" ? "bg-[#1d9bf0]/15 text-[#1d9bf0]" :
              round.category === "crypto"  ? "bg-yellow-500/15 text-yellow-400" :
              "bg-purple-500/15 text-purple-400"
            }`}>{round.category}</span>
            <span className="text-[10px] text-white/30">{round.totalPool.toFixed(1)} DORA pool</span>
            <span className={`text-[10px] font-mono ${isExpired ? "text-red-400" : "text-white/40"}`}>
              {timeRemaining(round.endsAt)}
            </span>
          </div>
        </div>

        <button
          onClick={() => setExpanded(v => !v)}
          className="text-xs text-white/40 hover:text-white border border-white/10 px-2.5 py-1 rounded transition-colors shrink-0"
        >
          {expanded ? "Hide" : "Resolve"}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {resolveOptions.map(opt => (
            <button
              key={opt}
              onClick={() => setSelected(opt)}
              className="px-2.5 py-1 rounded text-xs border transition-all"
              style={{
                background:  selected === opt ? `${OUTCOME_COLORS[opt] ?? "#888"}20` : "rgba(255,255,255,0.04)",
                borderColor: selected === opt ? (OUTCOME_COLORS[opt] ?? "#888") : "rgba(255,255,255,0.1)",
                color:       selected === opt ? (OUTCOME_COLORS[opt] ?? "#fff") : "rgba(255,255,255,0.5)",
              }}
            >
              {opt}
            </button>
          ))}
          {selected && (
            <button
              onClick={resolve}
              disabled={loading}
              className="px-3 py-1 rounded text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white transition-colors disabled:opacity-50 ml-1"
            >
              {loading ? "Resolving…" : `Set winner: ${selected}`}
            </button>
          )}
          {error   && <span className="text-red-400 text-xs">{error}</span>}
          {success && <span className="text-green-400 text-xs font-semibold">{success}</span>}
        </div>
      )}
    </div>
  );
}

// ── Main admin panel ──────────────────────────────────────────────────────────

export default function AdminPage() {
  const [password, setPassword]   = useState<string | null>(null);
  const [rounds, setRounds]       = useState<Round[]>([]);
  const [loading, setLoading]     = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [, tick] = useState(0);

  // Tick countdown timers every second
  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Restore session
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setPassword(stored);
  }, []);

  const fetchRounds = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/rounds", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed");
      const data: Round[] = await res.json();
      setRounds(data);
      setLastRefresh(new Date());
    } catch {
      console.error("Could not load rounds");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (password) {
      fetchRounds();
      const id = setInterval(fetchRounds, 15_000);
      return () => clearInterval(id);
    }
  }, [password, fetchRounds]);

  function handleLogin(pw: string) {
    localStorage.setItem(STORAGE_KEY, pw);
    setPassword(pw);
  }

  function handleLogout() {
    localStorage.removeItem(STORAGE_KEY);
    setPassword(null);
  }

  if (!password) return <LoginScreen onLogin={handleLogin} />;

  const twitterOpen  = rounds.filter(r => r.category === "twitter" && r.status === "open");
  const allOpen      = rounds.filter(r => r.status === "open");
  const expiredCount = twitterOpen.filter(r => new Date(r.endsAt) < new Date()).length;

  return (
    <div className="min-h-screen bg-[#0d0f14] text-white">
      {/* Top bar */}
      <div className="border-b border-white/8 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-white/40 hover:text-white text-sm transition-colors">← Home</Link>
          <span className="text-white/20">/</span>
          <span className="text-white font-semibold text-sm">Admin Panel</span>
          {expiredCount > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 font-semibold animate-pulse">
              {expiredCount} expired
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-white/30 text-xs">
              Refreshed {timeAgo(lastRefresh.toISOString())}
            </span>
          )}
          <button
            onClick={fetchRounds}
            disabled={loading}
            className="text-xs text-white/40 hover:text-white border border-white/10 px-2.5 py-1 rounded transition-colors disabled:opacity-40"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button
            onClick={handleLogout}
            className="text-xs text-white/40 hover:text-red-400 border border-white/10 px-2.5 py-1 rounded transition-colors"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-8">

        {/* ── Section A: Active Twitter Rounds ─────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-4 h-4 text-[#1d9bf0]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.858L1.808 2.25h6.946l4.258 5.63 5.232-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
            <h2 className="text-white font-semibold text-base">Active Twitter Rounds</h2>
            <span className="text-[11px] text-white/30">{twitterOpen.length} open</span>
          </div>

          {twitterOpen.length === 0 ? (
            <div className="rounded-xl border border-white/5 bg-[#13151b] p-8 text-center">
              <p className="text-white/30 text-sm">No active Twitter rounds</p>
            </div>
          ) : (
            <div className="space-y-3">
              {twitterOpen
                .sort((a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime())
                .map(round => (
                  <TwitterRoundCard
                    key={round.id}
                    round={round}
                    password={password}
                    onResolved={fetchRounds}
                  />
                ))}
            </div>
          )}
        </section>

        {/* ── Section B: All Active Rounds ─────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />
            <h2 className="text-white font-semibold text-base">All Active Rounds</h2>
            <span className="text-[11px] text-white/30">{allOpen.length} open</span>
          </div>

          {allOpen.length === 0 ? (
            <div className="rounded-xl border border-white/5 bg-[#13151b] p-8 text-center">
              <p className="text-white/30 text-sm">No active rounds</p>
            </div>
          ) : (
            <div className="rounded-xl border border-white/8 bg-[#13151b] overflow-hidden">
              {allOpen
                .sort((a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime())
                .map(round => (
                  <RoundRow
                    key={round.id}
                    round={round}
                    password={password}
                    onResolved={fetchRounds}
                  />
                ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
