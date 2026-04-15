"use client";

import { useEffect, useState } from "react";
import {
  LineChart, Line, YAxis, ReferenceArea, ReferenceLine,
  ResponsiveContainer, Tooltip,
} from "recharts";
import { Round, Outcome } from "@/lib/types";
import { LiveData } from "@/lib/useLiveData";
import { usePriceHistory } from "@/lib/usePriceHistory";
import Sparkline from "@/components/Sparkline";

interface RangeCardProps {
  round: Round;
  onBet: (round: Round, outcomeId: string, outcome: Outcome) => void;
  liveData?: LiveData;
}

const CATEGORY_STYLES: Record<string, string> = {
  crypto: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
};
const CATEGORY_LABELS: Record<string, string> = {
  crypto: "Crypto",
};

// Tailwind classes for outcome buttons / labels
const OUTCOME_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  A: { bg: "bg-red-500/10",    border: "border-red-500/30",    text: "text-red-400",    dot: "bg-red-400" },
  B: { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-400", dot: "bg-orange-400" },
  C: { bg: "bg-yellow-500/10", border: "border-yellow-500/30", text: "text-yellow-400", dot: "bg-yellow-400" },
  D: { bg: "bg-brand/10",      border: "border-brand/30",      text: "text-brand",      dot: "bg-brand" },
  E: { bg: "bg-sky-500/10",    border: "border-sky-500/30",    text: "text-sky-400",    dot: "bg-sky-400" },
  F: { bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-400", dot: "bg-purple-400" },
};

// rgba fill colors for chart zones (normal / active)
const ZONE_FILL: Record<string, string> = {
  A: "rgba(239,68,68,0.08)",    // red
  B: "rgba(249,115,22,0.08)",   // orange
  C: "rgba(234,179,8,0.08)",    // yellow
  D: "rgba(29,185,84,0.08)",    // green
  E: "rgba(14,165,233,0.08)",   // sky
  F: "rgba(168,85,247,0.08)",   // purple
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

function useCountdown(target: string): string {
  const [display, setDisplay] = useState("");
  useEffect(() => {
    function calc() {
      const diff = new Date(target).getTime() - Date.now();
      setDisplay(diff <= 0 ? "00:00" : formatCountdown(diff));
    }
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [target]);
  return display;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${n.toLocaleString("en-US")}`;
  return `$${n.toFixed(2)}`;
}

function findActiveOutcome(price: number, outcomes: Outcome[]): Outcome | null {
  return outcomes.find(o => {
    const above = o.minPrice === null || price >= o.minPrice;
    const below = o.maxPrice === null || price <  o.maxPrice;
    return above && below;
  }) ?? null;
}

// ── Live price chart ──────────────────────────────────────────────────────────

interface PriceChartProps {
  token: "bitcoin" | "solana";
  outcomes: Outcome[];
}

function PriceChart({ token, outcomes }: PriceChartProps) {
  const history = usePriceHistory(token);

  if (history.length < 2) {
    return (
      <div className="h-44 flex items-center justify-center text-muted text-[11px] gap-2">
        <svg className="animate-spin w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        Loading price data…
      </div>
    );
  }

  const currentPrice = history[history.length - 1].price;
  const activeOutcome = findActiveOutcome(currentPrice, outcomes);

  // Y domain: span all boundary values + any out-of-range price points
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

  // Unique inner boundaries (dividers between zones)
  const uniqueBoundaries = Array.from(new Set(boundaries)).sort((a, b) => a - b);

  // Y axis formatter
  const fmtY = token === "bitcoin"
    ? (v: number) => `$${Math.round(v).toLocaleString("en-US")}`
    : (v: number) => `$${v.toFixed(2)}`;

  // Tooltip formatter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tooltipFmt = (v: any) => [typeof v === "number" ? fmtY(v) : String(v), "Price"];

  // Chart data — keep time as ms, recharts just needs a value
  const data = history.map(p => ({ t: p.time, price: p.price }));

  return (
    <div className="h-44 w-full select-none">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 56, left: 0, bottom: 0 }}>
          {/* Zone bands */}
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

          {/* Inner boundary lines */}
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

          {/* Current price indicator */}
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
              fontSize: 9,
              dx: 4,
            }}
          />

          <YAxis
            yAxisId={0}
            domain={[domainMin, domainMax]}
            tickFormatter={fmtY}
            width={token === "bitcoin" ? 64 : 52}
            tick={{ fontSize: 8, fill: "#6b7280" }}
            tickCount={5}
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

          {/* Price line */}
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

// ── Resolved card ─────────────────────────────────────────────────────────────

function ResolvedRangeCard({ round }: { round: Round }) {
  const outcomes   = round.outcomes ?? [];
  const winning    = outcomes.find(o => o.id === round.winningOutcome);
  const colors     = round.winningOutcome ? OUTCOME_COLORS[round.winningOutcome] : null;

  const resolvedDate = round.resolvedAt
    ? (() => {
        const d    = new Date(round.resolvedAt);
        const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, ".");
        const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
        return `${date} at ${time}`;
      })()
    : null;

  return (
    <div className="bg-surface rounded-xl border border-surface-3 overflow-hidden opacity-80 hover:opacity-100 transition-opacity">
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border ${CATEGORY_STYLES[round.category] ?? "bg-surface-3 text-muted border-transparent"}`}>
            {CATEGORY_LABELS[round.category] ?? round.category}
          </span>
          {winning && colors && (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${colors.bg} ${colors.text} ${colors.border}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
              {round.winningOutcome} WON
            </span>
          )}
        </div>

        <p className="text-white/80 text-sm font-medium leading-snug mb-2">{round.question}</p>

        {winning && (
          <p className={`text-xs mb-3 font-mono ${colors?.text ?? "text-muted"}`}>
            Result: {winning.label} ✓
          </p>
        )}

        <div className="grid grid-cols-2 gap-1.5 mb-3">
          {outcomes.map(o => {
            const isWinner = o.id === round.winningOutcome;
            const c        = OUTCOME_COLORS[o.id];
            return (
              <div
                key={o.id}
                className={`rounded-lg px-2.5 py-1.5 border text-[10px] ${
                  isWinner
                    ? `${c.bg} ${c.border} ${c.text}`
                    : "bg-surface-2 border-surface-3 text-muted"
                }`}
              >
                <span className="font-bold mr-1">{o.id}</span>
                <span className="opacity-80">{o.label}</span>
                {isWinner && <span className="ml-1">✓</span>}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted border-t border-surface-3/50 pt-2.5">
          <span>Pool: <span className="text-white font-mono">{(round.realPool ?? 0).toFixed(2)} SOL</span></span>
          {resolvedDate && (
            <>
              <span className="text-surface-3">·</span>
              <span>Resolved: <span className="text-white/70">{resolvedDate}</span></span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Active card ───────────────────────────────────────────────────────────────

export default function RangeCard({ round, onBet, liveData }: RangeCardProps) {
  const resultCountdown  = useCountdown(round.endsAt);
  const bettingCountdown = useCountdown(round.bettingClosesAt ?? round.endsAt);
  const [showChart, setShowChart] = useState(false);

  const outcomes   = round.outcomes ?? [];
  const totalPool  = round.realPool ?? 0;
  const isEnded    = round.status !== "open";
  const bettingClosed = round.bettingClosesAt
    ? new Date() > new Date(round.bettingClosesAt)
    : isEnded;

  const chartToken: "bitcoin" | "solana" | null =
    round.targetToken === "bitcoin" ? "bitcoin" :
    round.targetToken === "solana"  ? "solana"  : null;

  if (round.status === "resolved") {
    return <ResolvedRangeCard round={round} />;
  }

  const isBtc = round.targetToken === "bitcoin";
  const isSol = round.targetToken === "solana";
  const asset  = isBtc ? liveData?.btc : isSol ? liveData?.sol : undefined;

  return (
    <div className="bg-surface rounded-xl border border-surface-3 overflow-hidden flex flex-col hover:border-surface-2 transition-colors group">
      <div className="p-4 flex-1">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border ${CATEGORY_STYLES[round.category] ?? "bg-surface-3 text-muted border-transparent"}`}>
            {CATEGORY_LABELS[round.category] ?? round.category}
          </span>
          <div className="flex items-center gap-1 text-xs text-muted shrink-0">
            <span className={`w-2 h-2 rounded-full ${isEnded ? "bg-no" : "bg-[#22c55e] pulse-dot"}`} />
            {resultCountdown}
          </div>
        </div>

        {/* Question */}
        <p className="text-white text-sm font-medium leading-snug mb-3 group-hover:text-white/90">
          {round.question}
        </p>

        {/* Live price row */}
        {asset && (
          <div className="rounded-lg bg-surface-2 border border-surface-3/60 px-3 py-2 mb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-white font-mono font-semibold text-sm">{fmt(asset.price)}</span>
                <span className={`font-mono text-xs ${asset.change24h >= 0 ? "text-yes" : "text-no"}`}>
                  {asset.change24h >= 0 ? "▲" : "▼"} {Math.abs(asset.change24h).toFixed(2)}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Sparkline data={asset.sparkline} positive={asset.change24h >= 0} />
                <span className="inline-flex items-center gap-1 text-[9px] font-bold tracking-widest text-brand uppercase">
                  <span className="w-2 h-2 rounded-full bg-[#22c55e] pulse-dot" />
                  LIVE
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Outcome grid */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          {outcomes.map((o) => {
            const c          = OUTCOME_COLORS[o.id];
            const multiplier = o.pool > 0 && totalPool > 0
              ? Math.max(1.05, (totalPool * 0.95) / o.pool)
              : null;
            const sharePct = totalPool > 0 ? (o.pool / totalPool) * 100 : 0;

            return (
              <button
                key={o.id}
                onClick={() => !bettingClosed && onBet(round, o.id, o)}
                disabled={bettingClosed}
                className={`relative flex flex-col gap-1 p-2.5 rounded-lg border text-left transition-all
                  ${bettingClosed
                    ? "opacity-40 cursor-not-allowed bg-surface-2 border-surface-3"
                    : `${c.bg} ${c.border} hover:opacity-90 active:scale-[0.98]`
                  }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${c.bg} ${c.text} border ${c.border}`}>
                    {o.id}
                  </span>
                  <span className="text-[10px] text-muted leading-tight">{o.label}</span>
                </div>

                <div className="h-1 rounded-full bg-surface-3 overflow-hidden w-full">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${c.dot}`}
                    style={{ width: `${sharePct}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-muted font-mono">{o.pool.toFixed(2)} SOL</span>
                  {multiplier !== null ? (
                    <span className={`font-mono font-bold ${c.text}`}>{multiplier.toFixed(2)}x</span>
                  ) : (
                    <span className="text-muted font-mono">--x</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Timer row */}
        {!bettingClosed ? (
          <div className="flex items-center justify-between text-[10px] mb-1">
            <div className="flex items-center gap-1.5 text-muted">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Betting closes in <span className="text-white font-mono font-semibold">{bettingCountdown}</span></span>
            </div>
            <div className="text-muted">
              Result in <span className="text-white font-mono font-semibold">{resultCountdown}</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between text-[10px] mb-1">
            <div className="flex items-center gap-1.5 text-no font-semibold">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m0 0v2m0-2h2m-2 0H10M12 3a9 9 0 110 18A9 9 0 0112 3z" />
              </svg>
              Betting Closed — Awaiting Result
            </div>
            <div className="text-muted">
              Result in <span className="text-white font-mono font-semibold">{resultCountdown}</span>
            </div>
          </div>
        )}

        {/* Live chart (collapsible) */}
        {chartToken && showChart && (
          <div className="mt-3 rounded-lg border border-surface-3/60 bg-surface-2 overflow-hidden">
            <div className="flex items-center gap-1.5 px-3 pt-2 pb-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] pulse-dot" />
              <span className="text-[9px] font-bold tracking-widest uppercase text-brand">Live Price</span>
            </div>
            <PriceChart token={chartToken} outcomes={outcomes} />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 pb-4 border-t border-surface-3/50 pt-3">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted">
            <span>
              Pool:{" "}
              {totalPool <= 0 ? (
                <span className="font-mono text-muted">0 SOL</span>
              ) : (
                <span className="text-white font-mono">{totalPool.toFixed(2)} SOL</span>
              )}
            </span>
            <span className="ml-2 text-[10px]">{outcomes.length} outcomes · parimutuel</span>
          </div>

          {/* Chart toggle */}
          {chartToken && (
            <button
              onClick={() => setShowChart(v => !v)}
              className="flex items-center gap-1 text-[10px] text-muted hover:text-white transition-colors px-2 py-1 rounded bg-surface-3 hover:bg-surface-2 border border-surface-3"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
              {showChart ? "Hide" : "Chart"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
