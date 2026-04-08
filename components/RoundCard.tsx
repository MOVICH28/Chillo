"use client";

import { useEffect, useState } from "react";
import { Round } from "@/lib/types";

interface RoundCardProps {
  round: Round;
  onBet: (round: Round, side: "yes" | "no") => void;
}

function useCountdown(endsAt: string) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    function calc() {
      const diff = new Date(endsAt).getTime() - Date.now();
      if (diff <= 0) return setTimeLeft("Ended");
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${h}h ${m}m ${s}s`);
    }
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  return timeLeft;
}

const CATEGORY_STYLES: Record<string, string> = {
  pumpfun: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  crypto: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
};

const CATEGORY_LABELS: Record<string, string> = {
  pumpfun: "pump.fun",
  crypto: "Crypto",
};

export default function RoundCard({ round, onBet }: RoundCardProps) {
  const timeLeft = useCountdown(round.endsAt);
  const isEnded = timeLeft === "Ended" || round.status !== "open";

  const yesPct = round.yesPct ?? 50;
  const noPct = round.noPct ?? 50;
  const yesOdds = round.yesOdds ?? 2.0;
  const noOdds = round.noOdds ?? 2.0;

  return (
    <div className="bg-surface rounded-xl border border-surface-3 overflow-hidden flex flex-col hover:border-surface-2 transition-colors group">
      {/* Header */}
      <div className="p-4 flex-1">
        <div className="flex items-start justify-between gap-2 mb-3">
          <span
            className={`inline-flex px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border ${
              CATEGORY_STYLES[round.category] ?? "bg-surface-3 text-muted border-transparent"
            }`}
          >
            {CATEGORY_LABELS[round.category] ?? round.category}
          </span>
          <div className="flex items-center gap-1 text-xs text-muted shrink-0">
            <span className={`w-1.5 h-1.5 rounded-full ${isEnded ? "bg-no" : "bg-brand animate-pulse-slow"}`} />
            {timeLeft}
          </div>
        </div>

        <p className="text-white text-sm font-medium leading-snug mb-4 group-hover:text-white/90">
          {round.question}
        </p>

        {/* Pool bar */}
        <div className="mb-3">
          <div className="flex justify-between text-[10px] text-muted mb-1">
            <span>YES {yesPct}%</span>
            <span>NO {noPct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-yes to-brand-dim rounded-full transition-all duration-500"
              style={{ width: `${yesPct}%` }}
            />
          </div>
        </div>

        {/* Odds row */}
        <div className="flex gap-2 mb-4">
          <div className="flex-1 bg-yes/5 border border-yes/20 rounded-lg px-3 py-2 text-center">
            <p className="text-[10px] text-muted">YES odds</p>
            <p className="text-yes font-bold font-mono text-sm">{yesOdds}x</p>
          </div>
          <div className="flex-1 bg-no/5 border border-no/20 rounded-lg px-3 py-2 text-center">
            <p className="text-[10px] text-muted">NO odds</p>
            <p className="text-no font-bold font-mono text-sm">{noOdds}x</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 pb-4">
        <div className="flex items-center justify-between text-xs text-muted mb-3">
          <span>
            Pool: <span className="text-white font-mono">◎{round.totalPool.toFixed(1)}</span>
          </span>
          <span>
            {(round.bets?.length ?? 0)} bets
          </span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onBet(round, "yes")}
            disabled={isEnded}
            className="flex-1 py-2 rounded-lg text-sm font-bold bg-yes/10 text-yes border border-yes/30
              hover:bg-yes hover:text-black transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            YES
          </button>
          <button
            onClick={() => onBet(round, "no")}
            disabled={isEnded}
            className="flex-1 py-2 rounded-lg text-sm font-bold bg-no/10 text-no border border-no/30
              hover:bg-no hover:text-white transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            NO
          </button>
        </div>
      </div>
    </div>
  );
}
