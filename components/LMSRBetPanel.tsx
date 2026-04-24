"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/useAuth";
import { costToBuy, PLATFORM_FEE } from "@/lib/lmsr";
import { Outcome } from "@/lib/types";

const OUTCOME_COLORS: Record<string, { bg: string; border: string; text: string; dot: string; bar: string }> = {
  A: { bg: "bg-red-500/10",    border: "border-red-500/40",    text: "text-red-400",    dot: "bg-red-400",    bar: "bg-red-400"    },
  B: { bg: "bg-orange-500/10", border: "border-orange-500/40", text: "text-orange-400", dot: "bg-orange-400", bar: "bg-orange-400" },
  C: { bg: "bg-yellow-500/10", border: "border-yellow-500/40", text: "text-yellow-400", dot: "bg-yellow-400", bar: "bg-yellow-400" },
  D: { bg: "bg-green-500/10",  border: "border-green-500/40",  text: "text-green-400",  dot: "bg-green-400",  bar: "bg-green-400"  },
  E: { bg: "bg-sky-500/10",    border: "border-sky-500/40",    text: "text-sky-400",    dot: "bg-sky-400",    bar: "bg-sky-400"    },
  F: { bg: "bg-purple-500/10", border: "border-purple-500/40", text: "text-purple-400", dot: "bg-purple-400", bar: "bg-purple-400" },
};

interface Position {
  outcome: string;
  shares: number;
  avgCost: number;
}

interface LMSRBetPanelProps {
  roundId:       string;
  outcomes:      Outcome[];
  lmsrB:         number;
  initialShares: Record<string, number>;
  bettingClosed: boolean;
  roundStatus:   string;
  winningOutcome: string | null;
  onTradeSuccess?: () => void;
}

export default function LMSRBetPanel({
  roundId, outcomes, lmsrB, initialShares,
  bettingClosed, roundStatus, winningOutcome, onTradeSuccess,
}: LMSRBetPanelProps) {
  const { user, getToken, refreshUser } = useAuth();
  const activeOutcomes = outcomes.map(o => o.id);

  const [prices,    setPrices]    = useState<Record<string, number>>({});
  const [prevPrices,setPrevPrices]= useState<Record<string, number>>({});
  const [curShares, setCurShares] = useState<Record<string, number>>(initialShares);
  const [positions, setPositions] = useState<Position[]>([]);

  const [selected,    setSelected]    = useState<string | null>(null);
  const [tradeType,   setTradeType]   = useState<"buy" | "sell">("buy");
  const [sharesInput, setSharesInput] = useState("10");
  const [txStatus,    setTxStatus]    = useState<"idle" | "placing" | "success" | "error">("idle");
  const [error,       setError]       = useState("");

  const PRESETS = ["5", "10", "25", "50"];

  // Poll prices + positions every 3 s
  const fetchMarket = useCallback(async () => {
    try {
      const token = getToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`/api/trade?roundId=${roundId}`, { headers, cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setPrevPrices(prev => Object.keys(data.prices).length > 0 ? prev : data.prices);
      setPrices(p => { setPrevPrices(p); return data.prices; });
      setCurShares(data.currentShares ?? {});
      if (data.positions) setPositions(data.positions);
    } catch { /* ignore */ }
  }, [roundId, getToken]);

  useEffect(() => {
    fetchMarket();
    const id = setInterval(fetchMarket, 3_000);
    return () => clearInterval(id);
  }, [fetchMarket]);

  // Estimated cost (client-side LMSR math)
  const sharesNum = parseFloat(sharesInput) || 0;
  let estimatedCost: number | null = null;
  if (selected && sharesNum > 0) {
    const raw = costToBuy(
      curShares, selected,
      tradeType === "buy" ? sharesNum : -sharesNum,
      lmsrB, activeOutcomes
    );
    estimatedCost = tradeType === "buy"
      ? raw * (1 + PLATFORM_FEE)
      : -(Math.abs(raw) * (1 - PLATFORM_FEE));
  }

  async function handleTrade() {
    if (!user) { setError("Login to trade"); return; }
    if (!selected || sharesNum <= 0) { setError("Select outcome and enter shares"); return; }
    setError("");
    setTxStatus("placing");
    try {
      const token = getToken();
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ roundId, outcome: selected, type: tradeType, shares: sharesNum }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Trade failed");
      setTxStatus("success");
      await refreshUser();
      await fetchMarket();
      onTradeSuccess?.();
      setTimeout(() => { setTxStatus("idle"); setSelected(null); setSharesInput("10"); }, 2000);
    } catch (e) {
      setTxStatus("error");
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  const busy    = txStatus === "placing";
  const resolved = roundStatus === "resolved";

  const positionMap = Object.fromEntries(positions.map(p => [p.outcome, p]));

  return (
    <div className="bg-white/[0.02] rounded-xl border border-white/5 p-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-white">Prediction Market</h2>
        <span className="text-[10px] text-white/30 uppercase tracking-wider">LMSR · 1% fee</span>
      </div>
      <p className="text-[11px] text-white/30 mb-4">
        {resolved ? "Market resolved" : bettingClosed ? "Betting closed" : "Buy or sell shares to predict the outcome"}
      </p>

      {resolved && winningOutcome && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border mb-4 text-xs font-semibold
          ${OUTCOME_COLORS[winningOutcome]?.bg} ${OUTCOME_COLORS[winningOutcome]?.text} ${OUTCOME_COLORS[winningOutcome]?.border}`}>
          <span className={`w-2 h-2 rounded-full ${OUTCOME_COLORS[winningOutcome]?.dot}`} />
          {winningOutcome} WON — {outcomes.find(o => o.id === winningOutcome)?.label}
        </div>
      )}

      {/* Outcome rows */}
      <div className="space-y-1.5 mb-4">
        {outcomes.map(o => {
          const c        = OUTCOME_COLORS[o.id];
          const price    = prices[o.id] ?? (1 / activeOutcomes.length);
          const prev     = prevPrices[o.id] ?? price;
          const pct      = (price * 100).toFixed(1);
          const arrow    = price > prev + 0.001 ? "↑" : price < prev - 0.001 ? "↓" : null;
          const arrowClr = arrow === "↑" ? "text-green-400" : "text-red-400";
          const pos      = positionMap[o.id];
          const isWinner = winningOutcome === o.id;
          const isSel    = selected === o.id;

          return (
            <div key={o.id}>
              <button
                onClick={() => {
                  if (resolved || bettingClosed) return;
                  setSelected(isSel ? null : o.id);
                  setTradeType("buy");
                  setError("");
                  setTxStatus("idle");
                }}
                disabled={resolved || bettingClosed}
                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all text-left
                  ${isSel ? `${c.bg} ${c.border} ring-1 ring-inset ${c.border}`
                    : isWinner ? `${c.bg} ${c.border}`
                    : resolved || bettingClosed ? "bg-white/[0.02] border-white/5 opacity-60 cursor-default"
                    : `bg-white/[0.02] border-white/5 hover:${c.bg} hover:${c.border} cursor-pointer`}`}
              >
                {/* Outcome badge */}
                <span className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold shrink-0 ${c.bg} ${c.text} border ${c.border}`}>
                  {o.id}
                </span>

                {/* Label */}
                <span className={`flex-1 text-xs font-medium truncate ${isSel || isWinner ? c.text : "text-white/70"}`}>
                  {o.label}{isWinner && <span className="ml-1 text-[10px]">✓</span>}
                </span>

                {/* Price change arrow */}
                {arrow && <span className={`text-[10px] font-bold shrink-0 ${arrowClr}`}>{arrow}</span>}

                {/* Probability bar + % */}
                <div className="flex flex-col items-end gap-0.5 shrink-0 w-16">
                  <div className="w-full h-1 rounded-full bg-white/5 overflow-hidden">
                    <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className={`text-[10px] font-mono font-bold ${c.text}`}>{pct}%</span>
                </div>

                {/* Price per share */}
                <span className="text-[10px] font-mono text-white/40 shrink-0 w-16 text-right">
                  {price.toFixed(3)} DORA
                </span>

                {/* Your position */}
                {pos && pos.shares > 0 ? (
                  <span className={`text-[10px] font-mono shrink-0 ${c.text}`}>{pos.shares.toFixed(1)}sh</span>
                ) : (
                  <span className="text-[10px] text-white/20 shrink-0 w-6">—</span>
                )}
              </button>

              {/* Expanded trade panel */}
              {isSel && !resolved && !bettingClosed && (
                <div className={`mt-1 mb-1 rounded-xl border p-4 ${c.bg} ${c.border}`}>
                  {/* Buy / Sell tabs */}
                  <div className="flex rounded-lg overflow-hidden border border-white/10 mb-3 text-xs font-semibold">
                    {(["buy", "sell"] as const).map(t => (
                      <button key={t} onClick={() => { setTradeType(t); setError(""); setTxStatus("idle"); }}
                        className={`flex-1 py-1.5 transition-colors ${tradeType === t
                          ? t === "buy" ? "bg-[#22c55e] text-black" : "bg-red-500 text-white"
                          : "text-white/40 hover:text-white/70"}`}>
                        {t === "buy" ? "Buy" : "Sell"}
                      </button>
                    ))}
                  </div>

                  {/* Share presets */}
                  <div className="flex gap-1.5 mb-2">
                    {PRESETS.map(v => (
                      <button key={v} onClick={() => setSharesInput(v)} disabled={busy}
                        className={`flex-1 py-1 rounded text-xs font-mono transition-colors disabled:opacity-40
                          ${sharesInput === v ? `${c.bg} ${c.text} border ${c.border}` : "bg-white/5 text-white/40 hover:text-white/70 border border-transparent"}`}>
                        {v}
                      </button>
                    ))}
                  </div>

                  {/* Shares input */}
                  <div className="flex items-center bg-black/30 rounded-lg px-3 py-2 mb-2 border border-white/10 focus-within:border-white/20">
                    <input type="number" min="0.01" step="0.01" value={sharesInput}
                      onChange={e => setSharesInput(e.target.value)} disabled={busy}
                      className="flex-1 bg-transparent text-white font-mono text-sm outline-none disabled:opacity-50"
                      placeholder="0" />
                    <span className="text-white/40 text-xs ml-2">shares</span>
                  </div>

                  {/* Cost preview */}
                  {estimatedCost !== null && (
                    <div className="flex items-center justify-between text-xs mb-3 px-0.5">
                      <span className="text-white/40">
                        {tradeType === "buy" ? "Estimated cost" : "Estimated proceeds"}
                        <span className="text-white/20 ml-1">(1% fee)</span>
                      </span>
                      <span className={`font-mono font-semibold ${tradeType === "buy" ? "text-white" : "text-[#22c55e]"}`}>
                        {tradeType === "buy"
                          ? `${estimatedCost.toFixed(4)} DORA`
                          : `+${(-estimatedCost).toFixed(4)} DORA`}
                      </span>
                    </div>
                  )}

                  {/* Sell: show current position */}
                  {tradeType === "sell" && pos && (
                    <p className="text-[10px] text-white/30 mb-2 px-0.5">
                      You hold {pos.shares.toFixed(2)} shares · avg cost {pos.avgCost.toFixed(4)} DORA/sh
                    </p>
                  )}

                  {/* Status */}
                  {txStatus === "success" && (
                    <p className="text-[#22c55e] text-xs mb-2 px-0.5 flex items-center gap-1.5">
                      <span>✓</span> Trade executed!
                    </p>
                  )}
                  {txStatus === "placing" && (
                    <p className="text-white/50 text-xs mb-2 px-0.5 flex items-center gap-1.5">
                      <svg className="animate-spin w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                      </svg>
                      Executing…
                    </p>
                  )}
                  {error && <p className="text-red-400 text-xs mb-2 px-0.5">{error}</p>}

                  {!user ? (
                    <p className="text-center text-white/40 text-xs py-2">Login to trade</p>
                  ) : (
                    <button onClick={handleTrade} disabled={busy || sharesNum <= 0}
                      className={`w-full py-2.5 rounded-lg font-bold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed
                        ${tradeType === "buy" ? "bg-[#22c55e] text-black hover:bg-[#16a34a]" : "bg-red-500 text-white hover:bg-red-600"}`}>
                      {busy ? "Processing…" : tradeType === "buy"
                        ? `Buy ${sharesNum} shares`
                        : `Sell ${sharesNum} shares`}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* My Positions */}
      {positions.length > 0 && (
        <div className="border-t border-white/5 pt-4">
          <h3 className="text-[10px] uppercase tracking-widest text-white/30 mb-2">My Positions</h3>
          <div className="space-y-1.5">
            {positions.map(pos => {
              const c          = OUTCOME_COLORS[pos.outcome];
              const curPrice   = prices[pos.outcome] ?? 0;
              const pnl        = (curPrice - pos.avgCost) * pos.shares;
              const pnlColor   = pnl >= 0 ? "text-[#22c55e]" : "text-red-400";
              const label      = outcomes.find(o => o.id === pos.outcome)?.label ?? pos.outcome;
              return (
                <div key={pos.outcome} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${c.bg} ${c.border}`}>
                  <span className={`font-bold shrink-0 ${c.text}`}>{pos.outcome}</span>
                  <span className="flex-1 truncate text-white/50">{label}</span>
                  <span className="font-mono text-white/70 shrink-0">{pos.shares.toFixed(2)} sh</span>
                  <span className={`font-mono font-semibold shrink-0 ${pnlColor}`}>
                    {pnl >= 0 ? "+" : ""}{pnl.toFixed(3)} DORA
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
