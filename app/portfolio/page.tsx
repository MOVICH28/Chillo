"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";
import RightPanel from "@/components/RightPanel";
import { useAuth } from "@/lib/useAuth";
import AuthModal from "@/components/AuthModal";

const OUTCOME_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  A: { text: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/30" },
  B: { text: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30" },
  C: { text: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30" },
  D: { text: "text-green-400",  bg: "bg-green-500/10",  border: "border-green-500/30" },
  E: { text: "text-sky-400",    bg: "bg-sky-500/10",    border: "border-sky-500/30" },
  F: { text: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/30" },
};

interface TradeRecord {
  type:       "buy" | "sell";
  shares:     number;
  totalCost:  number;
  profitLoss: number | null;
  createdAt:  string;
}

interface PortfolioPosition {
  id:              string;
  roundId:         string;
  question:        string;
  status:          string;
  winningOutcome:  string | null;
  outcome:         string;
  shares:          number;
  avgCost:         number;
  currentPrice:    number;
  currentValue:    number;
  amountInvested:  number;
  unrealizedPnl:   number;
  realizedPnl:     number;
  isSoleTrader:    boolean;
  isSold:          boolean;
  soldProceeds:    number;
  trades:          TradeRecord[];
  updatedAt:       string;
  bettingClosesAt: string | null;
  endsAt:          string;
}

interface PortfolioData {
  positions:  PortfolioPosition[];
  totalValue: number;
  totalCost:  number;
  totalPnl:   number;
}

interface Stats24h { volume24h: number; bets24h: number; activeMarkets: number; }

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Closed";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 48) return `${Math.floor(h / 24)}d`;
  if (h > 0)  return `${h}h ${m % 60}m`;
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function fmtVol(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(0);
}

// ── Sidebar Stats widget ──────────────────────────────────────────────────────

function SidebarStats() {
  const [stats, setStats] = useState<Stats24h>({ volume24h: 0, bets24h: 0, activeMarkets: 0 });

  useEffect(() => {
    const load = () => fetch("/api/stats").then(r => r.json()).then(setStats).catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mt-4 pt-3 border-t border-surface-3 flex flex-col gap-1">
      <p className="px-2 text-[10px] uppercase tracking-widest text-muted mb-1">Today</p>
      <div className="px-2 flex flex-col gap-1.5">
        {[
          { label: "Volume", value: `${fmtVol(stats.volume24h)} DORA`, color: "text-brand" },
          { label: "Bets",   value: String(stats.bets24h),             color: "text-white" },
          { label: "Markets",value: String(stats.activeMarkets),        color: "text-white" },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex items-center justify-between">
            <span className="text-[11px] text-muted">{label}</span>
            <span className={`text-[11px] font-mono font-semibold ${color}`}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const timeStr = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  if (d.toDateString() === today.toDateString()) return timeStr;
  const dateStr = d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit" });
  return `${dateStr} ${timeStr}`;
}

// ── Trade history row ─────────────────────────────────────────────────────────

function TradeHistory({ trades, isSoleTrader }: { trades: TradeRecord[]; isSoleTrader: boolean }) {
  if (trades.length === 0) return null;
  return (
    <div className="px-4 pb-3 space-y-1.5">
      {trades.map((t, i) => {
        const isBuy   = t.type === "buy";
        const doraAmt = isBuy ? t.totalCost : -t.totalCost;
        return (
          <div key={i} className="flex items-start gap-1.5 text-[10px] font-mono">
            <span className="shrink-0 text-[11px] leading-none mt-px">{isBuy ? "🟢" : "🔴"}</span>
            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 min-w-0">
              <span className={`font-semibold shrink-0 ${isBuy ? "text-[#22c55e]" : "text-red-400"}`}>
                {isBuy ? "Bought" : "Sold"}
              </span>
              <span className="text-white/20 shrink-0">·</span>
              <span className="text-white/30 shrink-0">{fmtTimestamp(t.createdAt)}</span>
              <span className="text-white/20 shrink-0">·</span>
              <span className="text-white/60 shrink-0">
                {doraAmt.toFixed(2)} DORA{!isBuy ? " received" : ""}
              </span>
              {!isBuy && t.profitLoss !== null && (
                <>
                  <span className="text-white/20 shrink-0">·</span>
                  <span className={`font-semibold shrink-0 ${t.profitLoss >= 0 ? "text-[#22c55e]" : "text-red-400"}`}>
                    {t.profitLoss >= 0 ? "+" : ""}{t.profitLoss.toFixed(2)} P&L
                  </span>
                </>
              )}
            </div>
          </div>
        );
      })}
      {isSoleTrader && (
        <p className="text-[9px] text-white/20 italic pt-0.5">P&L updates as other traders join</p>
      )}
    </div>
  );
}

// ── Position countdown ────────────────────────────────────────────────────────

function PositionTimers({ bettingClosesAt, endsAt }: { bettingClosesAt: string | null; endsAt: string }) {
  const [bettingLeft, setBettingLeft] = useState("");
  const [resultIn,    setResultIn]    = useState("");

  useEffect(() => {
    function update() {
      const now = Date.now();
      const betTarget = bettingClosesAt ? new Date(bettingClosesAt).getTime() : new Date(endsAt).getTime();
      setBettingLeft(formatCountdown(betTarget - now));
      setResultIn(formatCountdown(new Date(endsAt).getTime() - now));
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [bettingClosesAt, endsAt]);

  return (
    <div className="flex flex-wrap items-center gap-3 mt-1">
      <div className="flex items-center gap-1 text-[10px]">
        <span className="text-white/30">Betting:</span>
        <span className={`font-mono font-semibold ${bettingLeft === "Closed" ? "text-red-400" : "text-white"}`}>
          {bettingLeft || "…"}
        </span>
      </div>
      <div className="flex items-center gap-1 text-[10px]">
        <span className="text-white/30">Result in:</span>
        <span className="font-mono font-semibold text-white">{resultIn || "…"}</span>
      </div>
    </div>
  );
}

// ── Sell modal ────────────────────────────────────────────────────────────────

function SellModal({ pos, onClose, onSuccess, getToken }: {
  pos:       PortfolioPosition;
  onClose:   () => void;
  onSuccess: () => void;
  getToken:  () => string | null;
}) {
  const [pct,   setPct]   = useState(100);
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState("");

  const c           = OUTCOME_COLORS[pos.outcome] ?? { text: "text-white", bg: "bg-white/5", border: "border-white/10" };
  const invested    = pos.shares * pos.avgCost;          // DORA spent to acquire position
  const currentVal  = pos.currentValue;                  // current DORA value
  const doraToSell  = parseFloat(((pct / 100) * currentVal).toFixed(4));
  const estimated   = doraToSell * 0.99;                 // ~1% fee

  async function handleSell() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken() ?? ""}`,
        },
        // 100%: send exact shares to avoid LMSR marginal-price rounding leaving dust
        body: JSON.stringify(pct === 100
          ? { roundId: pos.roundId, outcome: pos.outcome, type: "sell", shares: pos.shares }
          : { roundId: pos.roundId, outcome: pos.outcome, type: "sell", doraAmount: doraToSell }),
      });
      if (res.ok) { onSuccess(); onClose(); }
      else { const d = await res.json(); setError(d.error ?? "Sell failed"); }
    } catch { setError("Network error"); }
    finally { setBusy(false); }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface border border-surface-3 rounded-xl w-full max-w-sm mx-4 p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">Sell Position</h3>
          <button onClick={onClose} className="text-muted hover:text-white text-2xl leading-none w-7 h-7 flex items-center justify-center">
            ×
          </button>
        </div>

        {/* Position info */}
        <div className="mb-3 flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs font-semibold border shrink-0 ${c.bg} ${c.text} ${c.border}`}>
            {pos.outcome}
          </span>
          <span className="text-white/60 text-sm line-clamp-1">{pos.question}</span>
        </div>

        {/* DORA value summary */}
        <div className="mb-4 grid grid-cols-2 gap-2">
          <div className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5">
            <p className="text-[9px] uppercase tracking-widest text-muted mb-0.5">Invested</p>
            <p className="text-sm font-mono font-semibold text-white">{invested.toFixed(2)} DORA</p>
          </div>
          <div className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5">
            <p className="text-[9px] uppercase tracking-widest text-muted mb-0.5">Current value</p>
            <p className={`text-sm font-mono font-semibold ${currentVal >= invested ? "text-[#22c55e]" : "text-red-400"}`}>
              {currentVal.toFixed(2)} DORA
            </p>
          </div>
        </div>

        {/* Sell percentage */}
        <p className="text-[10px] uppercase tracking-widest text-muted mb-2">Sell amount</p>
        <div className="grid grid-cols-4 gap-1.5 mb-4">
          {[25, 50, 75, 100].map(p => (
            <button
              key={p}
              onClick={() => setPct(p)}
              className={`py-1.5 rounded-lg text-xs font-semibold transition-colors
                ${pct === p
                  ? `${c.bg} ${c.text} border ${c.border}`
                  : "bg-white/5 text-white/40 hover:text-white/70 border border-transparent"}`}
            >
              {p}%
            </button>
          ))}
        </div>

        {/* Preview */}
        <div className="mb-4 px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/5 text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="text-muted">Selling</span>
            <span className="font-mono text-white">{doraToSell.toFixed(2)} DORA worth</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Est. proceeds (after ~1% fee)</span>
            <span className="font-mono text-[#22c55e] font-semibold">{estimated.toFixed(2)} DORA</span>
          </div>
        </div>

        {error && <p className="mb-3 text-red-400 text-xs">{error}</p>}

        <button
          onClick={handleSell}
          disabled={busy || doraToSell <= 0}
          className="w-full py-2.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/40 text-red-400 font-semibold text-sm transition-colors disabled:opacity-50"
        >
          {busy ? "Selling…" : `Sell ${pct}% · ${doraToSell.toFixed(2)} DORA`}
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const { user, getToken } = useAuth();
  const [mounted,  setMounted]  = useState(false);
  const [data,     setData]     = useState<PortfolioData | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [showAuth, setShowAuth] = useState(false);
  const [sellPos,  setSellPos]  = useState<PortfolioPosition | null>(null);

  useEffect(() => { setMounted(true); }, []);

  const fetchPortfolio = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch("/api/portfolio", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) setData(await res.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [getToken]);

  useEffect(() => {
    if (!mounted || !user) { setLoading(false); return; }
    fetchPortfolio();
    const id = setInterval(fetchPortfolio, 10_000);
    return () => clearInterval(id);
  }, [mounted, user, fetchPortfolio]);

  if (!mounted || !user) {
    return (
      <div className="min-h-screen bg-base flex flex-col items-center justify-center gap-4">
        <Navbar rounds={[]} />
        <p className="text-white text-lg font-semibold">Login to view your portfolio</p>
        <button onClick={() => setShowAuth(true)}
          className="px-5 py-2.5 rounded-xl font-bold border border-brand/40 text-brand hover:bg-brand/10 transition-colors">
          Login / Register
        </button>
        <Link href="/" className="text-muted text-sm hover:text-white transition-colors">← Back to markets</Link>
        {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      </div>
    );
  }

  const byRound = (data?.positions ?? []).reduce<Record<string, PortfolioPosition[]>>((acc, p) => {
    (acc[p.roundId] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-base text-white">
      <Navbar rounds={[]} />

      <div className="flex flex-row gap-3 max-w-[1400px] mx-auto w-full px-2 mt-14">

        {/* Left Sidebar */}
        <div className="hidden lg:block w-40 shrink-0 overflow-y-auto py-6 no-scrollbar sticky top-14 self-start h-[calc(100vh-3.5rem)]">
          <Sidebar active="all" onSelect={() => {}} counts={{}} />
          <SidebarStats />
        </div>

        {/* Main content */}
        <main className="min-w-0 flex-1 py-6">

          {/* Back arrow */}
          <Link href="/" className="flex items-center text-white/40 hover:text-white/70 transition-colors mb-4 w-fit">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>

          <div className="mb-6">
            <h1 className="text-white font-bold text-2xl">Portfolio</h1>
            <p className="text-muted text-xs mt-0.5">Your open LMSR positions · updates every 10s</p>
          </div>

          {/* Summary cards */}
          {data && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
              {[
                { label: "Total Value",   value: `${data.totalValue.toFixed(2)} DORA`, color: "text-white" },
                { label: "Cost Basis",    value: `${data.totalCost.toFixed(2)} DORA`,  color: "text-muted" },
                {
                  label: "Unrealized P&L",
                  value: `${data.totalPnl >= 0 ? "+" : ""}${data.totalPnl.toFixed(2)} DORA`,
                  color: data.totalPnl >= 0 ? "text-[#22c55e]" : "text-red-400",
                },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-surface border border-surface-3 rounded-xl p-4">
                  <p className="text-[10px] uppercase tracking-widest text-muted mb-1">{label}</p>
                  <p className={`font-mono font-bold text-lg ${color}`}>{value}</p>
                </div>
              ))}
            </div>
          )}

          {loading ? (
            <div className="bg-surface border border-surface-3 rounded-xl p-12 text-center text-muted text-sm">
              Loading…
            </div>
          ) : !data || data.positions.length === 0 ? (
            <div className="bg-surface border border-surface-3 rounded-xl p-12 text-center">
              <p className="text-white/40 text-sm mb-3">No open positions yet.</p>
              <Link href="/" className="text-brand text-sm hover:underline">Browse markets →</Link>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(byRound).map(([roundId, positions]) => {
                const first      = positions[0];
                const roundValue = positions.reduce((s, p) => s + p.currentValue, 0);
                const roundPnl   = positions.reduce((s, p) => s + p.unrealizedPnl, 0);
                const isResolved = first.status === "resolved";
                const allSole    = positions.every(p => p.isSoleTrader);
                const allSold    = positions.every(p => p.isSold);
                const totalSoldProceeds = positions.reduce((s, p) => s + p.soldProceeds, 0);

                return (
                  <div key={roundId} className="bg-surface border border-surface-3 rounded-xl overflow-hidden">
                    {/* Round header */}
                    <div className="px-4 py-3 border-b border-surface-3 flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <Link href={`/rounds/${roundId}`}
                          className="text-white text-sm font-semibold hover:text-brand transition-colors line-clamp-2">
                          {first.question}
                        </Link>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium
                            ${isResolved
                              ? "bg-white/5 text-white/30 border-white/10"
                              : "bg-[#22c55e]/10 text-[#22c55e] border-[#22c55e]/20"}`}>
                            {isResolved ? "Resolved" : "Live"}
                          </span>
                          {isResolved && first.winningOutcome && (
                            <span className={`text-[10px] font-semibold ${OUTCOME_COLORS[first.winningOutcome]?.text ?? "text-white"}`}>
                              Winner: {first.winningOutcome}
                            </span>
                          )}
                        </div>
                        {/* Timers — only for live rounds */}
                        {!isResolved && (
                          <PositionTimers
                            bettingClosesAt={first.bettingClosesAt}
                            endsAt={first.endsAt}
                          />
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        {allSold ? (
                          <>
                            <p className="text-xs text-muted">Received</p>
                            <p className="font-mono font-bold text-sm text-[#22c55e]">{totalSoldProceeds.toFixed(2)} DORA</p>
                          </>
                        ) : (
                          <>
                            <p className="text-xs text-muted">Value</p>
                            <p className="font-mono font-bold text-sm text-white">{roundValue.toFixed(3)} DORA</p>
                            {allSole ? (
                              <p className="text-[10px] text-white/30 italic">Awaiting traders</p>
                            ) : (
                              <p className={`font-mono text-xs ${roundPnl >= 0 ? "text-[#22c55e]" : "text-red-400"}`}>
                                {roundPnl >= 0 ? "+" : ""}{roundPnl.toFixed(3)}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Positions table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-[10px] uppercase tracking-widest text-muted border-b border-surface-3/50">
                            <th className="text-left px-4 py-2">Outcome</th>
                            <th className="text-right px-3 py-2">Invested</th>
                            <th className="text-right px-3 py-2">Cur. Value</th>
                            <th className="text-right px-3 py-2">P&L</th>
                            {!isResolved && <th className="text-right px-4 py-2"></th>}
                          </tr>
                        </thead>
                        <tbody>
                          {positions.map(pos => {
                            const c        = OUTCOME_COLORS[pos.outcome];
                            const isWinner = pos.winningOutcome === pos.outcome;
                            // Show realized P&L if any sells, else unrealized (hide if sole trader)
                            const hasSells    = pos.trades.some(t => t.type === "sell");
                            const displayPnl  = hasSells ? pos.realizedPnl : (pos.isSoleTrader ? null : pos.unrealizedPnl);
                            const pnlLabel    = hasSells ? "Realized" : (pos.isSoleTrader ? null : "Unrealized");
                            const pnlColor    = (displayPnl ?? 0) >= 0 ? "text-[#22c55e]" : "text-red-400";
                            return (
                              <tr key={pos.id} className={`border-b border-surface-3/30 ${isWinner ? c.bg : "hover:bg-white/[0.02]"}`}>
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold border ${c.bg} ${c.text} ${c.border}`}>
                                      {pos.outcome}
                                      {isWinner && <span>✓</span>}
                                    </span>
                                    {pos.isSold && (
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/25">
                                        Sold
                                      </span>
                                    )}
                                  </div>
                                </td>
                                {pos.isSold ? (
                                  <>
                                    <td className="px-3 py-2.5 text-right font-mono text-muted text-[11px]" colSpan={2}>
                                      <span className="text-[#22c55e] font-semibold">
                                        {pos.soldProceeds > 0 ? `${pos.soldProceeds.toFixed(2)} DORA received` : "—"}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-mono text-[11px]">
                                      {pos.realizedPnl !== 0 && (
                                        <span className={pos.realizedPnl >= 0 ? "text-[#22c55e]" : "text-red-400"}>
                                          {pos.realizedPnl >= 0 ? "+" : ""}{pos.realizedPnl.toFixed(2)}
                                        </span>
                                      )}
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    <td className="px-3 py-2.5 text-right font-mono text-muted">
                                      {pos.amountInvested.toFixed(2)}
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-mono text-white/80">
                                      {pos.currentValue.toFixed(2)}
                                    </td>
                                    <td className="px-3 py-2.5 text-right">
                                      {displayPnl === null ? (
                                        <span className="text-white/25 text-[10px] italic">—</span>
                                      ) : (
                                        <div className="flex flex-col items-end">
                                          <span className={`font-mono font-semibold text-[11px] ${pnlColor}`}>
                                            {displayPnl >= 0 ? "+" : ""}{displayPnl.toFixed(2)}
                                          </span>
                                          {pnlLabel && (
                                            <span className="text-[8px] text-white/20 uppercase tracking-wide">{pnlLabel}</span>
                                          )}
                                        </div>
                                      )}
                                    </td>
                                  </>
                                )}
                                <td className="px-4 py-2.5 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    {!isResolved && !pos.isSold && (
                                      <button
                                        onClick={() => setSellPos(pos)}
                                        className="px-2.5 py-1 rounded text-[10px] font-semibold bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 transition-colors"
                                      >
                                        Sell
                                      </button>
                                    )}
                                    {(() => {
                                      const pnl = pos.isSold ? pos.realizedPnl : pos.unrealizedPnl;
                                      if (Math.abs(pnl) < 0.01) return null;
                                      const sign = pnl >= 0 ? "+" : "";
                                      const text = `I ${pnl >= 0 ? "made" : "lost"} ${sign}${pnl.toFixed(1)} DORA on outcome ${pos.outcome} on @pumpdora! pumpdora.com?ref=${user?.username ?? ""}\n#PredictionMarket #Solana #DORA`;
                                      return (
                                        <button
                                          onClick={() => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer")}
                                          title="Share on X"
                                          className="flex items-center gap-0.5 px-1.5 py-1 rounded text-[10px] font-semibold bg-[#1d9bf0]/10 hover:bg-[#1d9bf0]/20 border border-[#1d9bf0]/30 text-[#1d9bf0] transition-colors"
                                        >
                                          <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                          </svg>
                                        </button>
                                      );
                                    })()}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Trade history per position */}
                    {positions.map(pos => (
                      <TradeHistory key={pos.id} trades={pos.trades} isSoleTrader={pos.isSoleTrader} />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </main>

        {/* Right Panel */}
        <div className="hidden xl:block w-64 shrink-0 py-6 sticky top-14 self-start h-[calc(100vh-3.5rem)] overflow-y-auto no-scrollbar">
          <RightPanel rounds={[]} />
        </div>

      </div>

      {/* Sell modal */}
      {sellPos && (
        <SellModal
          pos={sellPos}
          onClose={() => setSellPos(null)}
          onSuccess={fetchPortfolio}
          getToken={getToken}
        />
      )}
    </div>
  );
}
