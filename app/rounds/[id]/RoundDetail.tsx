"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  LineChart, Line, YAxis, ReferenceArea, ReferenceLine,
  ResponsiveContainer, Tooltip,
} from "recharts";
import { Outcome } from "@/lib/types";
import { useBinancePrice } from "@/lib/useBinancePrice";
import BetModal from "@/components/BetModal";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RoundData {
  id: string;
  question: string;
  category: string;
  status: "open" | "closed" | "resolved";
  endsAt: string;
  createdAt: string;
  resolvedAt: string | null;
  bettingClosesAt: string | null;
  targetToken: string | null;
  targetPrice: number | null;
  tokenList: string | null;
  winner: string | null;
  winningOutcome: string | null;
  outcomes: Outcome[] | null;
  yesPool: number;
  noPool: number;
  totalPool: number;
  realPool: number;
}

interface RecentBet {
  id: string;
  walletAddress: string;
  side: string;
  amount: number;
  odds: number;
  createdAt: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const OUTCOME_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  A: { bg: "bg-red-500/10",    border: "border-red-500/30",    text: "text-red-400",    dot: "bg-red-400" },
  B: { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-400", dot: "bg-orange-400" },
  C: { bg: "bg-yellow-500/10", border: "border-yellow-500/30", text: "text-yellow-400", dot: "bg-yellow-400" },
  D: { bg: "bg-brand/10",      border: "border-brand/30",      text: "text-brand",      dot: "bg-brand" },
  E: { bg: "bg-sky-500/10",    border: "border-sky-500/30",    text: "text-sky-400",    dot: "bg-sky-400" },
  F: { bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-400", dot: "bg-purple-400" },
};

const ZONE_FILL: Record<string, string> = {
  A: "rgba(239,68,68,0.08)",
  B: "rgba(249,115,22,0.08)",
  C: "rgba(234,179,8,0.08)",
  D: "rgba(29,185,84,0.08)",
  E: "rgba(14,165,233,0.08)",
  F: "rgba(168,85,247,0.08)",
};
const ZONE_FILL_ACTIVE: Record<string, string> = {
  A: "rgba(239,68,68,0.22)",
  B: "rgba(249,115,22,0.22)",
  C: "rgba(234,179,8,0.22)",
  D: "rgba(29,185,84,0.22)",
  E: "rgba(14,165,233,0.22)",
  F: "rgba(168,85,247,0.22)",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCountdown(ms: number): string {
  if (ms <= 0) return "00:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function useCountdown(target: string | null): string {
  const [display, setDisplay] = useState("");
  useEffect(() => {
    if (!target) return;
    function calc() {
      const diff = new Date(target!).getTime() - Date.now();
      setDisplay(diff <= 0 ? "00:00" : formatCountdown(diff));
    }
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [target]);
  return display;
}


function findActiveOutcome(price: number, outcomes: Outcome[]): Outcome | null {
  return outcomes.find(o => {
    const above = o.minPrice === null || price >= o.minPrice;
    const below = o.maxPrice === null || price <  o.maxPrice;
    return above && below;
  }) ?? null;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

// ── Live chart ────────────────────────────────────────────────────────────────

interface ChartProps {
  token: "bitcoin" | "solana";
  outcomes: Outcome[];
}

function LiveChart({ token, outcomes }: ChartProps) {
  const { price, history, status } = useBinancePrice(token);

  if (status === "connecting" || history.length < 2) {
    return (
      <div className="h-[300px] flex items-center justify-center text-muted text-xs gap-2">
        <svg className="animate-spin w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        Connecting to Binance…
      </div>
    );
  }

  const currentPrice = price ?? history[history.length - 1].price;
  const activeOutcome = findActiveOutcome(currentPrice, outcomes);

  const boundaries = outcomes
    .flatMap(o => [o.minPrice, o.maxPrice])
    .filter((b): b is number => b !== null);
  const priceValues = history.map(p => p.price);
  const allValues   = [...boundaries, ...priceValues];
  const rawMin      = Math.min(...allValues);
  const rawMax      = Math.max(...allValues);
  const pad         = (rawMax - rawMin) * 0.12;
  const domainMin   = rawMin - pad;
  const domainMax   = rawMax + pad;

  const uniqueBoundaries = Array.from(new Set(boundaries)).sort((a, b) => a - b);

  const fmtY = token === "bitcoin"
    ? (v: number) => `$${Math.round(v).toLocaleString("en-US")}`
    : (v: number) => `$${v.toFixed(2)}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tooltipFmt = (v: any) => [typeof v === "number" ? fmtY(v) : String(v), "Price"];

  const data = history.map(p => ({ t: p.time, price: p.price }));

  return (
    <div className="h-[300px] w-full select-none">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 64, left: 0, bottom: 0 }}>
          {outcomes.map(o => (
            <ReferenceArea
              key={o.id}
              y1={o.minPrice ?? domainMin}
              y2={o.maxPrice ?? domainMax}
              yAxisId={0}
              fill={o.id === activeOutcome?.id ? ZONE_FILL_ACTIVE[o.id] : ZONE_FILL[o.id]}
              strokeOpacity={0}
              ifOverflow="extendDomain"
            />
          ))}

          {uniqueBoundaries.map(b => (
            <ReferenceLine
              key={b}
              y={b}
              yAxisId={0}
              stroke="#3a3b4a"
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          ))}

          <ReferenceLine
            y={currentPrice}
            yAxisId={0}
            stroke="#22c55e"
            strokeWidth={1.5}
            strokeDasharray="6 3"
            label={{
              value: fmtY(currentPrice),
              position: "right",
              fill: "#22c55e",
              fontSize: 10,
              dx: 4,
            }}
          />

          <YAxis
            yAxisId={0}
            domain={[domainMin, domainMax]}
            tickFormatter={fmtY}
            width={token === "bitcoin" ? 72 : 56}
            tick={{ fontSize: 10, fill: "#6b7280" }}
            tickCount={6}
            axisLine={false}
            tickLine={false}
          />

          <Tooltip
            formatter={tooltipFmt}
            labelFormatter={() => ""}
            contentStyle={{
              background: "#1a1b23",
              border: "1px solid #2a2b38",
              borderRadius: 6,
              fontSize: 11,
              padding: "4px 8px",
            }}
            itemStyle={{ color: "#22c55e" }}
            cursor={{ stroke: "#2a2b38", strokeWidth: 1 }}
          />

          <Line
            yAxisId={0}
            type="monotone"
            dataKey="price"
            stroke="#22c55e"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3, fill: "#22c55e", stroke: "#13141a", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RoundDetail({ initialRound }: { initialRound: RoundData }) {
  const [round, setRound] = useState<RoundData>(initialRound);
  const [recentBets, setRecentBets] = useState<RecentBet[]>([]);
  const [betModal, setBetModal] = useState<{ side: string; outcome: Outcome } | null>(null);
  const [copied, setCopied] = useState(false);

  const resultCountdown  = useCountdown(round.endsAt);
  const bettingCountdown = useCountdown(round.bettingClosesAt ?? round.endsAt);

  const outcomes     = round.outcomes ?? [];
  const totalPool    = round.realPool ?? 0;
  const bettingClosed = round.bettingClosesAt
    ? new Date() > new Date(round.bettingClosesAt)
    : round.status !== "open";

  const token: "bitcoin" | "solana" = round.targetToken === "solana" ? "solana" : "bitcoin";
  const hasToken = round.targetToken === "bitcoin" || round.targetToken === "solana";

  // Poll for fresh round + bets
  const refreshRound = useCallback(async () => {
    try {
      const res = await fetch(`/api/rounds/${round.id}`);
      if (!res.ok) return;
      const data = await res.json();
      setRound(data);
      setRecentBets(data.recentBets ?? []);
    } catch { /* ignore */ }
  }, [round.id]);

  useEffect(() => {
    refreshRound();
    const id = setInterval(refreshRound, 5_000);
    return () => clearInterval(id);
  }, [refreshRound]);

  function handleShare() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const resolvedDate = round.resolvedAt
    ? (() => {
        const d    = new Date(round.resolvedAt);
        const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, ".");
        const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
        return `${date} at ${time}`;
      })()
    : null;

  return (
    <div className="min-h-screen bg-[var(--background)] text-white">
      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-muted hover:text-white text-sm mb-6 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          All Markets
        </Link>

        {/* Header */}
        <div className="bg-surface rounded-xl border border-surface-3 p-5 mb-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
                Crypto
              </span>
              {round.status === "resolved" ? (
                <span className="inline-flex px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border bg-surface-3 text-muted border-surface-3">
                  Resolved
                </span>
              ) : bettingClosed ? (
                <span className="inline-flex px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border bg-no/10 text-no border-no/20">
                  Betting Closed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border bg-yes/10 text-yes border-yes/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] pulse-dot" />
                  Live
                </span>
              )}
            </div>

            {/* Share button */}
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 text-[11px] text-muted hover:text-white transition-colors px-2.5 py-1.5 rounded-lg bg-surface-3 hover:bg-surface-2 border border-surface-3 shrink-0"
            >
              {copied ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-yes" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  Share
                </>
              )}
            </button>
          </div>

          <h1 className="text-white font-semibold text-lg leading-snug mb-3">
            {round.question}
          </h1>

          {/* Timers */}
          {round.status !== "resolved" && (
            <div className="flex items-center justify-between text-xs text-muted">
              {!bettingClosed ? (
                <>
                  <span>
                    Betting closes in{" "}
                    <span className="text-white font-mono font-semibold">{bettingCountdown}</span>
                  </span>
                  <span>
                    Result in{" "}
                    <span className="text-white font-mono font-semibold">{resultCountdown}</span>
                  </span>
                </>
              ) : (
                <>
                  <span className="text-no font-semibold">Betting Closed — Awaiting Result</span>
                  <span>
                    Result in{" "}
                    <span className="text-white font-mono font-semibold">{resultCountdown}</span>
                  </span>
                </>
              )}
            </div>
          )}

          {round.status === "resolved" && resolvedDate && (
            <p className="text-xs text-muted">Resolved {resolvedDate}</p>
          )}
        </div>

        {/* Live chart */}
        {hasToken && outcomes.length > 0 && (
          <div className="bg-surface rounded-xl border border-surface-3 mb-4 overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3 pb-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#22c55e] pulse-dot" />
                <span className="text-xs font-bold tracking-widest uppercase text-brand">Live Price</span>
              </div>
              <span className="text-[10px] text-muted uppercase tracking-wider">
                {round.targetToken === "bitcoin" ? "BTC/USDT" : "SOL/USDT"} · Binance
              </span>
            </div>
            <LiveChart token={token} outcomes={outcomes} />
          </div>
        )}

        {/* Outcome buttons */}
        {outcomes.length > 0 && (
          <div className="bg-surface rounded-xl border border-surface-3 p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-white">Pick an Outcome</h2>
              <span className="text-[10px] text-muted">
                Pool: <span className="text-white font-mono">{totalPool.toFixed(2)} SOL</span>
              </span>
            </div>

            {round.status === "resolved" && round.winningOutcome && (
              <div className={`mb-3 flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold
                ${OUTCOME_COLORS[round.winningOutcome]?.bg} ${OUTCOME_COLORS[round.winningOutcome]?.text} ${OUTCOME_COLORS[round.winningOutcome]?.border}`}>
                <span className={`w-2 h-2 rounded-full ${OUTCOME_COLORS[round.winningOutcome]?.dot}`} />
                {round.winningOutcome} WON — {outcomes.find(o => o.id === round.winningOutcome)?.label}
              </div>
            )}

            <div className="flex flex-col gap-2">
              {outcomes.map((o) => {
                const c          = OUTCOME_COLORS[o.id];
                const isWinner   = round.winningOutcome === o.id;
                const multiplier = o.pool > 0 && totalPool > 0
                  ? Math.max(1.05, (totalPool * 0.95) / o.pool)
                  : null;
                const sharePct = totalPool > 0 ? (o.pool / totalPool) * 100 : 0;
                const disabled = bettingClosed || round.status === "resolved";

                return (
                  <button
                    key={o.id}
                    onClick={() => { if (!disabled) setBetModal({ side: o.id, outcome: o }); }}
                    disabled={disabled}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all
                      ${disabled
                        ? isWinner
                          ? `${c.bg} ${c.border} opacity-100`
                          : "bg-surface-2 border-surface-3 opacity-50 cursor-not-allowed"
                        : `${c.bg} ${c.border} hover:opacity-90 active:scale-[0.99] cursor-pointer`
                      }`}
                  >
                    {/* ID badge */}
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0
                      ${c.bg} ${c.text} border ${c.border}`}>
                      {o.id}
                    </span>

                    {/* Label + bar */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-medium truncate ${isWinner ? c.text : "text-white/80"}`}>
                          {o.label}
                          {isWinner && <span className="ml-1">✓</span>}
                        </span>
                        {multiplier !== null ? (
                          <span className={`text-xs font-mono font-bold ml-2 shrink-0 ${c.text}`}>
                            {multiplier.toFixed(2)}x
                          </span>
                        ) : (
                          <span className="text-xs font-mono text-muted ml-2 shrink-0">--x</span>
                        )}
                      </div>
                      <div className="h-1 rounded-full bg-surface-3 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${c.dot}`}
                          style={{ width: `${sharePct}%` }}
                        />
                      </div>
                    </div>

                    {/* Pool */}
                    <span className="text-[10px] font-mono text-muted shrink-0 w-16 text-right">
                      {o.pool.toFixed(2)} SOL
                    </span>
                  </button>
                );
              })}
            </div>

            {!bettingClosed && round.status !== "resolved" && (
              <p className="text-[10px] text-muted mt-3 text-center">
                Click any outcome to place a bet · Parimutuel · 5% platform fee
              </p>
            )}
          </div>
        )}

        {/* Recent bets feed */}
        <div className="bg-surface rounded-xl border border-surface-3 p-4">
          <h2 className="text-sm font-semibold text-white mb-3">
            Recent Bets
            {recentBets.length > 0 && (
              <span className="text-muted font-normal text-xs ml-2">{recentBets.length} shown</span>
            )}
          </h2>

          {recentBets.length === 0 ? (
            <p className="text-muted text-xs text-center py-4">No bets yet — be the first!</p>
          ) : (
            <div className="space-y-2">
              {recentBets.map((bet) => {
                const c = OUTCOME_COLORS[bet.side] ?? { text: "text-muted", bg: "bg-surface-3", border: "border-surface-3", dot: "bg-muted" };
                return (
                  <div
                    key={bet.id}
                    className="flex items-center justify-between text-xs py-2 border-b border-surface-3/50 last:border-0"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${c.bg} ${c.text} border ${c.border} shrink-0`}>
                        {bet.side}
                      </span>
                      <span className="text-muted font-mono truncate">{shortAddr(bet.walletAddress)}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-white font-mono">{bet.amount.toFixed(2)} SOL</span>
                      <span className="text-muted font-mono">{bet.odds.toFixed(2)}x</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* Bet modal */}
      {betModal && (
        <BetModal
          round={{
            ...round,
            outcomes: round.outcomes ?? undefined,
          }}
          side={betModal.side}
          outcome={betModal.outcome}
          onClose={() => setBetModal(null)}
          onSuccess={() => {
            setBetModal(null);
            refreshRound();
          }}
        />
      )}
    </div>
  );
}
