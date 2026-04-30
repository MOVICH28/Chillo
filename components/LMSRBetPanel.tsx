"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/lib/useAuth";
import { costToBuy, getPrice, PLATFORM_FEE } from "@/lib/lmsr";
import { Outcome } from "@/lib/types";

const OUTCOME_COLORS: Record<string, { bg: string; border: string; text: string; dot: string; bar: string }> = {
  A: { bg: "bg-red-500/10",    border: "border-red-500/40",    text: "text-red-400",    dot: "bg-red-400",    bar: "bg-red-400"    },
  B: { bg: "bg-orange-500/10", border: "border-orange-500/40", text: "text-orange-400", dot: "bg-orange-400", bar: "bg-orange-400" },
  C: { bg: "bg-yellow-500/10", border: "border-yellow-500/40", text: "text-yellow-400", dot: "bg-yellow-400", bar: "bg-yellow-400" },
  D: { bg: "bg-green-500/10",  border: "border-green-500/40",  text: "text-green-400",  dot: "bg-green-400",  bar: "bg-green-400"  },
  E: { bg: "bg-sky-500/10",    border: "border-sky-500/40",    text: "text-sky-400",    dot: "bg-sky-400",    bar: "bg-sky-400"    },
  F: { bg: "bg-purple-500/10", border: "border-purple-500/40", text: "text-purple-400", dot: "bg-purple-400", bar: "bg-purple-400" },
};

const DEFAULT_PRESETS = [10, 25, 50, 100];
const SELL_PRESETS    = [25, 50, 75, 100];

interface Position { outcome: string; shares: number; avgCost: number; }

interface LMSRBetPanelProps {
  roundId:        string;
  outcomes:       Outcome[];
  lmsrB:          number;
  initialShares:  Record<string, number>;
  bettingClosed:  boolean;
  roundStatus:    string;
  winningOutcome: string | null;
  initialOutcome?: string | null;
  onTradeSuccess?: () => void;
}

export default function LMSRBetPanel({
  roundId, outcomes, lmsrB, initialShares,
  bettingClosed, roundStatus, winningOutcome, initialOutcome, onTradeSuccess,
}: LMSRBetPanelProps) {
  const { user, getToken, refreshUser } = useAuth();
  const activeOutcomes = outcomes.map(o => o.id);

  const [prices,     setPrices]     = useState<Record<string, number>>({});
  const [prevPrices, setPrevPrices] = useState<Record<string, number>>({});
  const [curShares,  setCurShares]  = useState<Record<string, number>>(initialShares);
  const [positions,  setPositions]  = useState<Position[]>([]);

  const [selected,  setSelected]  = useState<string | null>(initialOutcome ?? null);
  const [tradeType, setTradeType] = useState<"buy" | "sell">("buy");
  const [doraInput, setDoraInput] = useState("25");
  const [sellPct,   setSellPct]   = useState(100);
  const [txStatus,  setTxStatus]  = useState<"idle" | "placing" | "success" | "error">("idle");
  const [error,     setError]     = useState("");

  // Editable presets — persisted in localStorage
  const [presets, setPresets] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem("pumpdora_presets");
      const parsed = saved ? JSON.parse(saved) : null;
      if (Array.isArray(parsed) && parsed.length === 4 && parsed.every(n => typeof n === "number"))
        return parsed;
    } catch { /* ignore */ }
    return DEFAULT_PRESETS;
  });
  const [editingPreset,  setEditingPreset]  = useState<number | null>(null);
  const [presetDraft,    setPresetDraft]    = useState("");
  const presetInputRef = useRef<HTMLInputElement>(null);

  // Focus preset input when it appears
  useEffect(() => {
    if (editingPreset !== null) presetInputRef.current?.focus();
  }, [editingPreset]);

  function savePreset(index: number, raw: string) {
    const value = parseFloat(raw);
    if (!isNaN(value) && value >= 1) {
      const next = [...presets];
      next[index] = Math.round(value);
      setPresets(next);
      localStorage.setItem("pumpdora_presets", JSON.stringify(next));
    }
    setEditingPreset(null);
  }

  // Poll prices + positions every 3 s
  const fetchMarket = useCallback(async () => {
    try {
      const token = getToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`/api/trade?roundId=${roundId}`, { headers, cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
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

  const busy     = txStatus === "placing";
  const resolved = roundStatus === "resolved";
  const positionMap = Object.fromEntries(positions.map(p => [p.outcome, p]));

  // ── Buy preview ─────────────────────────────────────────────────────────────
  const doraNum      = parseFloat(doraInput) || 0;
  const spotPrice    = selected ? (prices[selected] ?? getPrice(curShares, selected, lmsrB, activeOutcomes)) : 0;
  const buyFee       = doraNum > 0 ? doraNum * PLATFORM_FEE / (1 + PLATFORM_FEE) : 0;
  const approxShares = spotPrice > 0 ? (doraNum - buyFee) / spotPrice : 0;

  // ── Sell preview ─────────────────────────────────────────────────────────────
  const selPos       = selected ? positionMap[selected] : undefined;
  const sharesToSell = selPos ? (sellPct / 100) * selPos.shares : 0;
  let sellProceeds   = 0;
  let sellFee        = 0;
  if (selected && sharesToSell > 0) {
    const raw   = costToBuy(curShares, selected, -sharesToSell, lmsrB, activeOutcomes); // negative
    const gross = -raw;
    sellFee     = gross * PLATFORM_FEE;
    sellProceeds = gross - sellFee;
  }

  async function handleTrade() {
    if (!user) { setError("Login to trade"); return; }
    if (!selected) { setError("Select an outcome"); return; }
    if (tradeType === "buy" && doraNum <= 0) { setError("Enter a DORA amount"); return; }
    if (tradeType === "sell" && sharesToSell <= 0) { setError("No shares to sell"); return; }
    setError("");
    setTxStatus("placing");
    try {
      const token = getToken();
      const body = tradeType === "buy"
        ? { roundId, outcome: selected, type: "buy",  doraAmount: doraNum }
        : { roundId, outcome: selected, type: "sell", shares: sharesToSell };
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Trade failed");
      setTxStatus("success");
      await refreshUser();
      await fetchMarket();
      onTradeSuccess?.();
      window.dispatchEvent(new CustomEvent("trade-placed"));
      setTimeout(() => { setTxStatus("idle"); setSelected(null); setDoraInput("25"); setSellPct(100); }, 2000);
    } catch (e) {
      setTxStatus("error");
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  return (
    <div className="bg-white/[0.02] rounded-xl border border-white/5 p-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-white">Prediction Market</h2>
        <span className="text-[10px] text-white/30 uppercase tracking-wider">LMSR · 1% fee</span>
      </div>
      <p className="text-[11px] text-white/30 mb-4">
        {resolved ? "Market resolved" : bettingClosed ? "Betting closed" : "Spend DORA to predict the outcome"}
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
                className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-xl border transition-all text-left
                  ${isSel
                    ? `${c.bg} ${c.border} ring-1 ring-inset ${c.border}`
                    : isWinner ? `${c.bg} ${c.border}`
                    : resolved || bettingClosed ? "bg-white/[0.02] border-white/5 opacity-60 cursor-default"
                    : "bg-white/[0.02] border-white/5 hover:bg-white/[0.04] cursor-pointer"}`}
              >
                <span className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold shrink-0 ${c.bg} ${c.text} border ${c.border}`}>
                  {o.id}
                </span>
                <span className={`flex-1 text-xs font-medium min-w-0 truncate whitespace-nowrap ${isSel || isWinner ? c.text : "text-white/70"}`}>
                  {o.label}{isWinner && <span className="ml-1 text-[10px]">✓</span>}
                </span>
                {arrow && <span className={`text-[10px] font-bold shrink-0 ${arrowClr}`}>{arrow}</span>}
                <div className="flex flex-col items-end gap-0.5 shrink-0 w-12">
                  <div className="w-full h-1 rounded-full bg-white/5 overflow-hidden">
                    <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className={`text-[10px] font-mono font-bold ${c.text}`}>{pct}%</span>
                </div>
                <span className="text-[10px] font-mono text-white/40 shrink-0 w-14 text-right">
                  {price.toFixed(2)} D
                </span>
                {pos && pos.shares > 0
                  ? <span className={`text-[10px] font-mono shrink-0 ${c.text}`}>{(pos.shares * pos.avgCost).toFixed(2)} D</span>
                  : <span className="text-[10px] text-white/20 shrink-0 w-6">—</span>}
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

                  {tradeType === "buy" ? (
                    <>
                      {/* Editable presets + MAX */}
                      <div className="flex gap-1.5 mb-2">
                        {presets.map((preset, idx) => (
                          editingPreset === idx ? (
                            <input
                              key={idx}
                              ref={presetInputRef}
                              type="number"
                              min="1"
                              value={presetDraft}
                              onChange={e => setPresetDraft(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter") savePreset(idx, presetDraft);
                                if (e.key === "Escape") setEditingPreset(null);
                              }}
                              onBlur={() => savePreset(idx, presetDraft)}
                              className="flex-1 min-w-0 py-1 rounded text-xs font-mono text-center bg-black/40 text-white border border-white/30 outline-none"
                            />
                          ) : (
                            <button
                              key={idx}
                              onClick={() => setDoraInput(String(preset))}
                              onDoubleClick={() => { setEditingPreset(idx); setPresetDraft(String(preset)); }}
                              disabled={busy}
                              title="Double-click to edit"
                              className={`flex-1 py-1 rounded text-xs font-mono transition-colors disabled:opacity-40
                                ${doraInput === String(preset)
                                  ? `${c.bg} ${c.text} border ${c.border}`
                                  : "bg-white/5 text-white/40 hover:text-white/70 border border-transparent"}`}
                            >
                              {preset}
                            </button>
                          )
                        ))}
                        {/* MAX button */}
                        <button
                          onClick={() => user && setDoraInput(Math.floor(user.doraBalance).toString())}
                          disabled={busy || !user}
                          className="px-2 py-1 rounded text-xs font-mono font-bold border border-[#22c55e]/40 text-[#22c55e] hover:bg-[#22c55e]/10 transition-colors disabled:opacity-30"
                        >
                          MAX
                        </button>
                      </div>

                      {/* DORA input with balance validation */}
                      {(() => {
                        const overBalance = user && doraNum > user.doraBalance;
                        return (
                          <>
                            <div className={`flex items-center bg-black/30 rounded-lg px-3 py-2 mb-1 border transition-colors focus-within:border-white/20
                              ${overBalance ? "border-red-500/60" : "border-white/10"}`}>
                              <input
                                type="number" min="0.01" step="0.01" value={doraInput}
                                onChange={e => setDoraInput(e.target.value)} disabled={busy}
                                className="flex-1 bg-transparent text-white font-mono text-sm outline-none disabled:opacity-50"
                                placeholder="0.00"
                              />
                              <span className="text-white/40 text-xs ml-2">DORA</span>
                            </div>
                            {overBalance && (
                              <p className="text-red-400 text-[10px] mb-1 px-0.5">Insufficient balance</p>
                            )}
                            {user && (
                              <p className="text-white/20 text-[10px] mb-2 px-0.5">
                                Balance: {Math.floor(user.doraBalance).toLocaleString()} DORA
                              </p>
                            )}
                          </>
                        );
                      })()}

                      {/* Buy preview */}
                      {doraNum > 0 && approxShares > 0 && (
                        <div className="space-y-1 mb-3 px-0.5">
                          <div className="flex justify-between text-xs">
                            <span className="text-white/40">If correct</span>
                            <span className="font-mono text-[#22c55e] font-semibold">~{approxShares.toFixed(2)} DORA</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-white/40">Probability</span>
                            <span className="font-mono text-white/70">{(spotPrice * 100).toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-white/40">Fee (1%)</span>
                            <span className="font-mono text-white/50">{buyFee.toFixed(2)} DORA</span>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {/* Sell % presets */}
                      {selPos && selPos.shares > 0 ? (
                        <>
                          <div className="flex gap-1.5 mb-3">
                            {SELL_PRESETS.map(pct => (
                              <button key={pct} onClick={() => setSellPct(pct)} disabled={busy}
                                className={`flex-1 py-1 rounded text-xs font-mono transition-colors disabled:opacity-40
                                  ${sellPct === pct ? `${c.bg} ${c.text} border ${c.border}` : "bg-white/5 text-white/40 hover:text-white/70 border border-transparent"}`}>
                                {pct}%
                              </button>
                            ))}
                          </div>

                          {/* Sell preview */}
                          {(() => {
                            const posInvested = selPos.shares * selPos.avgCost;
                            // Use LMSR integral for full position value (not marginal price × shares)
                            const fullRaw   = -costToBuy(curShares, selected!, -selPos.shares, lmsrB, activeOutcomes);
                            const fullValue = Math.max(0, fullRaw * (1 - PLATFORM_FEE));
                            const outcomeShares = curShares[selected!] ?? 0;
                            const isSoleTrader  = outcomeShares > 0 && selPos.shares >= outcomeShares * 0.99;
                            const posPnl        = isSoleTrader ? null : fullValue - posInvested;
                            return (
                              <div className="space-y-1 mb-3 px-0.5">
                                <div className="flex justify-between text-xs">
                                  <span className="text-white/40">Your position</span>
                                  <span className="font-mono text-white/70">{posInvested.toFixed(2)} DORA</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                  <span className="text-white/40">Current value</span>
                                  <span className="font-mono text-white/70">{fullValue.toFixed(2)} DORA</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                  <span className="text-white/40">Profit / Loss</span>
                                  {posPnl === null ? (
                                    <span className="text-white/30 text-[10px] italic">— awaiting other traders</span>
                                  ) : (
                                    <span className={`font-mono font-semibold ${posPnl >= 0 ? "text-[#22c55e]" : "text-red-400"}`}>
                                      {posPnl >= 0 ? "+" : ""}{posPnl.toFixed(2)} DORA
                                    </span>
                                  )}
                                </div>
                                <div className="flex justify-between text-xs pt-0.5 border-t border-white/5">
                                  <span className="text-white/40">You will receive</span>
                                  <span className="font-mono text-[#22c55e] font-semibold">~{sellProceeds.toFixed(2)} DORA</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                  <span className="text-white/40">Fee (1%)</span>
                                  <span className="font-mono text-white/50">{sellFee.toFixed(2)} DORA</span>
                                </div>
                              </div>
                            );
                          })()}
                        </>
                      ) : (
                        <p className="text-white/30 text-xs mb-3 text-center py-2">No position to sell</p>
                      )}
                    </>
                  )}

                  {/* Status messages */}
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
                    <button
                      onClick={handleTrade}
                      disabled={
                        busy ||
                        (tradeType === "buy" ? (doraNum <= 0 || doraNum > (user?.doraBalance ?? 0)) : sharesToSell <= 0)
                      }
                      className={`w-full py-2.5 rounded-lg font-bold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed
                        ${tradeType === "buy" ? "bg-[#22c55e] text-black hover:bg-[#16a34a]" : "bg-red-500 text-white hover:bg-red-600"}`}>
                      {busy ? "Processing…" : tradeType === "buy"
                        ? `Spend ${doraNum} DORA`
                        : `Receive ~${sellProceeds.toFixed(2)} DORA`}
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
              const c           = OUTCOME_COLORS[pos.outcome];
              const invested    = pos.shares * pos.avgCost;
              // Use LMSR integral for actual sell value (not marginal price × shares)
              const rawFull      = -costToBuy(curShares, pos.outcome, -pos.shares, lmsrB, activeOutcomes);
              const currentValue = Math.max(0, rawFull * (1 - PLATFORM_FEE));
              // Sole-trader: user holds ≥95% of this outcome's total shares
              const outcomeShares = curShares[pos.outcome] ?? 0;
              const isSole        = outcomeShares > 0 && pos.shares >= outcomeShares * 0.95;
              const pnl           = isSole ? null : currentValue - invested;
              const label         = outcomes.find(o => o.id === pos.outcome)?.label ?? pos.outcome;
              return (
                <div key={pos.outcome} className={`flex flex-col gap-1 px-3 py-2 rounded-lg border ${c.bg} ${c.border}`}>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`font-bold shrink-0 ${c.text}`}>{pos.outcome}</span>
                    <span className="flex-1 min-w-0 truncate text-white/40 text-[10px]">{label}</span>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <span className="font-mono text-white/60 text-[10px]">{invested.toFixed(2)} in</span>
                      {isSole
                        ? <span className="text-white/25 text-[9px] italic">waiting for other traders</span>
                        : <span className="font-mono text-white/80 text-[10px]">{currentValue.toFixed(2)} now</span>}
                    </div>
                    {pnl === null ? (
                      <span className="font-mono text-white/25 shrink-0 text-[10px]">—</span>
                    ) : (
                      <span className={`font-mono font-semibold shrink-0 ${pnl >= 0 ? "text-[#22c55e]" : "text-red-400"}`}>
                        {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {positions.some(p => {
            const os = curShares[p.outcome] ?? 0;
            return os > 0 && p.shares >= os * 0.95;
          }) && (
            <p className="text-[9px] text-white/20 italic mt-1.5">P&L shows once other traders join</p>
          )}
        </div>
      )}
    </div>
  );
}
