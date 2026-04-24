"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
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

interface PortfolioPosition {
  id:            string;
  roundId:       string;
  question:      string;
  status:        string;
  winningOutcome: string | null;
  outcome:       string;
  shares:        number;
  avgCost:       number;
  currentPrice:  number;
  currentValue:  number;
  unrealizedPnl: number;
  updatedAt:     string;
}

interface PortfolioData {
  positions:  PortfolioPosition[];
  totalValue: number;
  totalCost:  number;
  totalPnl:   number;
}

export default function PortfolioPage() {
  const { user, getToken } = useAuth();
  const [mounted,   setMounted]   = useState(false);
  const [data,      setData]      = useState<PortfolioData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [showAuth,  setShowAuth]  = useState(false);

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

  // Group positions by round
  const byRound = (data?.positions ?? []).reduce<Record<string, PortfolioPosition[]>>((acc, p) => {
    (acc[p.roundId] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-base pt-16">
      <Navbar rounds={[]} />
      <div className="max-w-4xl mx-auto px-4 py-8">

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-white font-bold text-2xl">Portfolio</h1>
            <p className="text-muted text-xs mt-0.5">Your open LMSR positions · updates every 10s</p>
          </div>
          <Link href="/" className="text-muted text-sm hover:text-white transition-colors">← Markets</Link>
        </div>

        {/* Summary cards */}
        {data && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
            {[
              { label: "Total Value",   value: `${data.totalValue.toFixed(2)} DORA`,  color: "text-white" },
              { label: "Cost Basis",    value: `${data.totalCost.toFixed(2)} DORA`,   color: "text-muted" },
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
              const first       = positions[0];
              const roundValue  = positions.reduce((s, p) => s + p.currentValue, 0);
              const roundPnl    = positions.reduce((s, p) => s + p.unrealizedPnl, 0);
              const isResolved  = first.status === "resolved";

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
                          ${isResolved ? "bg-white/5 text-white/30 border-white/10"
                          : "bg-[#22c55e]/10 text-[#22c55e] border-[#22c55e]/20"}`}>
                          {isResolved ? "Resolved" : "Live"}
                        </span>
                        {isResolved && first.winningOutcome && (
                          <span className={`text-[10px] font-semibold ${OUTCOME_COLORS[first.winningOutcome]?.text ?? "text-white"}`}>
                            Winner: {first.winningOutcome}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted">Value</p>
                      <p className="font-mono font-bold text-sm text-white">{roundValue.toFixed(3)} DORA</p>
                      <p className={`font-mono text-xs ${roundPnl >= 0 ? "text-[#22c55e]" : "text-red-400"}`}>
                        {roundPnl >= 0 ? "+" : ""}{roundPnl.toFixed(3)}
                      </p>
                    </div>
                  </div>

                  {/* Positions table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-widest text-muted border-b border-surface-3/50">
                          <th className="text-left px-4 py-2">Outcome</th>
                          <th className="text-right px-3 py-2">Shares</th>
                          <th className="text-right px-3 py-2">Avg Cost</th>
                          <th className="text-right px-3 py-2">Cur. Price</th>
                          <th className="text-right px-4 py-2">Unrealized P&L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {positions.map(pos => {
                          const c        = OUTCOME_COLORS[pos.outcome];
                          const pnlColor = pos.unrealizedPnl >= 0 ? "text-[#22c55e]" : "text-red-400";
                          const isWinner = pos.winningOutcome === pos.outcome;
                          return (
                            <tr key={pos.id} className={`border-b border-surface-3/30 ${isWinner ? c.bg : "hover:bg-white/[0.02]"}`}>
                              <td className="px-4 py-2.5">
                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold border ${c.bg} ${c.text} ${c.border}`}>
                                  {pos.outcome}
                                  {isWinner && <span>✓</span>}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono text-white/80">{pos.shares.toFixed(2)}</td>
                              <td className="px-3 py-2.5 text-right font-mono text-muted">{pos.avgCost.toFixed(4)}</td>
                              <td className="px-3 py-2.5 text-right font-mono text-white/80">{pos.currentPrice.toFixed(4)}</td>
                              <td className={`px-4 py-2.5 text-right font-mono font-semibold ${pnlColor}`}>
                                {pos.unrealizedPnl >= 0 ? "+" : ""}{pos.unrealizedPnl.toFixed(4)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
