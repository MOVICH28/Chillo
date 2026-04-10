"use client";

import { useEffect, useState } from "react";
import { Round } from "@/lib/types";
import { LiveData } from "@/lib/useLiveData";
import Sparkline from "@/components/Sparkline";

interface RoundCardProps {
  round: Round;
  onBet: (round: Round, side: "yes" | "no") => void;
  liveData?: LiveData;
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
  crypto:  "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
};

const CATEGORY_LABELS: Record<string, string> = {
  pumpfun: "pump.fun",
  crypto:  "Crypto",
};

/** Pull the first dollar-denominated number from a question */
function extractTarget(question: string): number | null {
  const m = question.match(/\$([0-9,]+)/);
  if (!m) return null;
  return parseFloat(m[1].replace(/,/g, ""));
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${n.toLocaleString()}`;
  return `$${n.toFixed(2)}`;
}

function LiveDot() {
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-bold tracking-widest text-brand uppercase">
      <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
      LIVE
    </span>
  );
}

// ── Crypto context widget ─────────────────────────────────────────────────────
interface CryptoWidgetProps {
  price: number;
  change24h: number;
  sparkline: number[];
  target: number | null;
}

function CryptoWidget({ price, change24h, sparkline, target }: CryptoWidgetProps) {
  const positive = change24h >= 0;
  const changeColor = positive ? "text-yes" : "text-no";
  const changePrefix = positive ? "▲" : "▼";

  let distanceRow: React.ReactNode = null;
  if (target !== null && price > 0) {
    const diff = target - price;
    const pct = (Math.abs(diff) / price) * 100;
    const already = diff <= 0;
    if (already) {
      distanceRow = (
        <p className="text-yes text-[10px] mt-1">
          Already above target by {fmt(Math.abs(diff))} (+{pct.toFixed(1)}%)
        </p>
      );
    } else {
      distanceRow = (
        <p className="text-muted text-[10px] mt-1">
          Need{" "}
          <span className="text-white">+{fmt(diff)}</span>
          {" "}more{" "}
          <span className="text-muted">(+{pct.toFixed(1)}% to {fmt(target)})</span>
        </p>
      );
    }
  }

  return (
    <div className="rounded-lg bg-surface-2 border border-surface-3/60 px-3 py-2 mb-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-white font-mono font-semibold text-sm">{fmt(price)}</span>
          <span className={`${changeColor} font-mono text-xs`}>
            {changePrefix} {Math.abs(change24h).toFixed(2)}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Sparkline data={sparkline} positive={positive} />
          <LiveDot />
        </div>
      </div>
      {distanceRow}
    </div>
  );
}

// ── pump.fun volume context widget ────────────────────────────────────────────
interface VolumeWidgetProps {
  volume24h: number;
  volumeTarget: number;
}

function VolumeWidget({ volume24h, volumeTarget }: VolumeWidgetProps) {
  const pct = Math.min((volume24h / volumeTarget) * 100, 100);
  const barColor = pct >= 90 ? "bg-yes" : pct >= 60 ? "bg-brand" : "bg-yellow-500";

  return (
    <div className="rounded-lg bg-surface-2 border border-surface-3/60 px-3 py-2 mb-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-white text-[11px] font-mono font-medium">
          ${volume24h}M
          <span className="text-muted font-normal"> / ${volumeTarget}M target</span>
        </span>
        <LiveDot />
      </div>
      <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-muted text-[10px] mt-1">
        24h volume:{" "}
        <span className={pct >= 90 ? "text-yes" : "text-yellow-400"}>
          {pct.toFixed(1)}% of target
        </span>
      </p>
    </div>
  );
}

// ── pump.fun market cap context widget ────────────────────────────────────────
interface McapWidgetProps {
  topAth: number;
  tokensAbove1M: number;
}

function McapWidget({ topAth, tokensAbove1M }: McapWidgetProps) {
  return (
    <div className="rounded-lg bg-surface-2 border border-surface-3/60 px-3 py-2 mb-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-[11px]">
          <span className="text-muted">
            Best ATH:{" "}
            <span className={`font-mono font-semibold ${topAth >= 1 ? "text-yes" : "text-white"}`}>
              ${topAth}M
            </span>
          </span>
          <span className="text-surface-3">·</span>
          <span className="text-muted">
            <span className="text-white font-semibold">{tokensAbove1M}</span> token
            {tokensAbove1M !== 1 ? "s" : ""} hit $1M+
          </span>
        </div>
        <LiveDot />
      </div>
    </div>
  );
}

// ── Main card ─────────────────────────────────────────────────────────────────
export default function RoundCard({ round, onBet, liveData }: RoundCardProps) {
  const timeLeft = useCountdown(round.endsAt);
  const isEnded = timeLeft === "Ended" || round.status !== "open";

  const yesPct  = round.yesPct  ?? 50;
  const noPct   = round.noPct   ?? 50;
  const yesOdds = round.yesOdds ?? 2.0;
  const noOdds  = round.noOdds  ?? 2.0;

  const q = round.question.toLowerCase();

  // Detect round type to pick the right context widget
  const isBtc    = q.includes("btc") || q.includes("bitcoin");
  const isSol    = (q.includes("solana") || q.includes(" sol ")) && !isBtc;
  const isPfVol  = round.category === "pumpfun" && q.includes("volume");
  const isPfMcap = round.category === "pumpfun" && q.includes("market cap");

  let contextWidget: React.ReactNode = null;

  if (isBtc && liveData?.btc) {
    contextWidget = (
      <CryptoWidget
        price={liveData.btc.price}
        change24h={liveData.btc.change24h}
        sparkline={liveData.btc.sparkline}
        target={extractTarget(round.question)}
      />
    );
  } else if (isSol && liveData?.sol) {
    contextWidget = (
      <CryptoWidget
        price={liveData.sol.price}
        change24h={liveData.sol.change24h}
        sparkline={liveData.sol.sparkline}
        target={extractTarget(round.question)}
      />
    );
  } else if (isPfVol && liveData?.pumpfun) {
    contextWidget = (
      <VolumeWidget
        volume24h={liveData.pumpfun.volume24h}
        volumeTarget={liveData.pumpfun.volumeTarget}
      />
    );
  } else if (isPfMcap && liveData?.pumpfun) {
    contextWidget = (
      <McapWidget
        topAth={liveData.pumpfun.topAth}
        tokensAbove1M={liveData.pumpfun.tokensAbove1M}
      />
    );
  }

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

        <p className="text-white text-sm font-medium leading-snug mb-3 group-hover:text-white/90">
          {round.question}
        </p>

        {/* Live context widget */}
        {contextWidget}

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

      </div>

      {/* Footer */}
      <div className="px-4 pb-4">
        <div className="flex items-center justify-between text-xs text-muted mb-3">
          <span>
            Pool: <span className="text-white font-mono">◎{round.totalPool.toFixed(1)}</span>
          </span>
          <span>{round.bets?.length ?? 0} bets</span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onBet(round, "yes")}
            disabled={isEnded}
            className="flex-1 py-2 px-4 rounded-full flex flex-row items-center justify-center gap-1.5
              bg-yes/10 text-yes border border-yes/30
              hover:bg-yes hover:text-black transition-all duration-150
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="text-[12px] font-semibold opacity-70 leading-none">YES</span>
            <span className="w-1 h-1 rounded-full bg-current opacity-40" />
            <span className="text-[15px] font-bold font-mono leading-none">{yesOdds}x</span>
          </button>
          <button
            onClick={() => onBet(round, "no")}
            disabled={isEnded}
            className="flex-1 py-2 px-4 rounded-full flex flex-row items-center justify-center gap-1.5
              bg-no/10 text-no border border-no/30
              hover:bg-no hover:text-white transition-all duration-150
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="text-[12px] font-semibold opacity-70 leading-none">NO</span>
            <span className="w-1 h-1 rounded-full bg-current opacity-40" />
            <span className="text-[15px] font-bold font-mono leading-none">{noOdds}x</span>
          </button>
        </div>
      </div>
    </div>
  );
}
