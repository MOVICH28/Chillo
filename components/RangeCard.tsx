"use client";

import { useEffect, useState } from "react";
import { Round, Outcome } from "@/lib/types";
import { LiveData } from "@/lib/useLiveData";
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

// A–D label colours
const OUTCOME_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  A: { bg: "bg-red-500/10",    border: "border-red-500/30",    text: "text-red-400",    dot: "bg-red-400" },
  B: { bg: "bg-yellow-500/10", border: "border-yellow-500/30", text: "text-yellow-400", dot: "bg-yellow-400" },
  C: { bg: "bg-brand/10",      border: "border-brand/30",      text: "text-brand",      dot: "bg-brand" },
  D: { bg: "bg-yes/10",        border: "border-yes/30",        text: "text-yes",        dot: "bg-yes" },
};

function useCountdown(target: string) {
  const [timeLeft, setTimeLeft] = useState("");
  useEffect(() => {
    function calc() {
      const diff = new Date(target).getTime() - Date.now();
      if (diff <= 0) return setTimeLeft("Ended");
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${h}h ${m}m ${s}s`);
    }
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [target]);
  return timeLeft;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${n.toLocaleString("en-US")}`;
  return `$${n.toFixed(2)}`;
}

// ── Resolved range card ───────────────────────────────────────────────────────
function ResolvedRangeCard({ round }: { round: Round }) {
  const outcomes = round.outcomes ?? [];
  const winning  = outcomes.find(o => o.id === round.winningOutcome);
  const colors   = round.winningOutcome ? OUTCOME_COLORS[round.winningOutcome] : null;

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
        {/* Top row */}
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

        {/* Question */}
        <p className="text-white/80 text-sm font-medium leading-snug mb-2">{round.question}</p>

        {/* Winning range */}
        {winning && (
          <p className={`text-xs mb-3 font-mono ${colors?.text ?? "text-muted"}`}>
            Result: {winning.label} ✓
          </p>
        )}

        {/* Outcome grid */}
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

        {/* Footer */}
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

// ── Main card ─────────────────────────────────────────────────────────────────
export default function RangeCard({ round, onBet, liveData }: RangeCardProps) {
  const roundCountdown   = useCountdown(round.endsAt);
  const bettingCountdown = useCountdown(round.bettingClosesAt ?? round.endsAt);
  const outcomes         = round.outcomes ?? [];
  const totalPool        = round.realPool ?? 0;
  const isEnded          = roundCountdown === "Ended" || round.status !== "open";
  const bettingClosed    = round.bettingClosesAt
    ? new Date() > new Date(round.bettingClosesAt)
    : isEnded;

  if (round.status === "resolved") {
    return <ResolvedRangeCard round={round} />;
  }

  // Live price context
  const isBtc = round.targetToken === "bitcoin";
  const isSol = round.targetToken === "solana";
  const asset  = isBtc ? liveData?.btc : isSol ? liveData?.sol : undefined;

  return (
    <div className="bg-surface rounded-xl border border-surface-3 overflow-hidden flex flex-col hover:border-surface-2 transition-colors group">
      <div className="p-4 flex-1">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border ${CATEGORY_STYLES[round.category] ?? "bg-surface-3 text-muted border-transparent"}`}>
            {CATEGORY_LABELS[round.category] ?? round.category}
          </span>
          <div className="flex items-center gap-1 text-xs text-muted shrink-0">
            <span className={`w-2 h-2 rounded-full ${isEnded ? "bg-no" : "bg-[#22c55e] pulse-dot"}`} />
            {roundCountdown}
          </div>
        </div>

        {/* Question */}
        <p className="text-white text-sm font-medium leading-snug mb-3 group-hover:text-white/90">
          {round.question}
        </p>

        {/* Live price widget */}
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
                {/* Outcome ID + label */}
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${c.bg} ${c.text} border ${c.border}`}>
                    {o.id}
                  </span>
                  <span className="text-[10px] text-muted leading-tight">{o.label}</span>
                </div>

                {/* Pool bar */}
                <div className="h-1 rounded-full bg-surface-3 overflow-hidden w-full">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${c.dot}`}
                    style={{ width: `${sharePct}%` }}
                  />
                </div>

                {/* Stats */}
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

        {/* Betting closes notice */}
        {!bettingClosed && round.bettingClosesAt && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted mb-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Betting closes in <span className="text-white font-mono">{bettingCountdown}</span></span>
          </div>
        )}
        {bettingClosed && !isEnded && (
          <p className="text-[10px] text-no mb-1">Betting closed — awaiting resolution</p>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 pb-4 border-t border-surface-3/50 pt-3">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>
            Total pool:{" "}
            {totalPool <= 0 ? (
              <span className="font-mono text-muted">0 SOL</span>
            ) : (
              <span className="text-white font-mono">{totalPool.toFixed(2)} SOL</span>
            )}
          </span>
          <span className="text-[10px]">{outcomes.length} outcomes · parimutuel</span>
        </div>
      </div>
    </div>
  );
}
