"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Round, Outcome } from "@/lib/types";
import { LiveData } from "@/lib/useLiveData";

interface RangeCardProps {
  round: Round;
  onBet?: (round: Round, outcomeId: string, outcome: Outcome) => void;
  liveData?: LiveData;
}

const CATEGORY_STYLES: Record<string, string> = {
  crypto: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
};
const CATEGORY_LABELS: Record<string, string> = {
  crypto: "Crypto",
};
const TOKEN_LOGOS: Record<string, string> = {
  bitcoin: "https://assets.coingecko.com/coins/images/1/small/bitcoin.png",
  solana:  "https://assets.coingecko.com/coins/images/4128/small/solana.png",
};

const OUTCOME_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  A: { bg: "bg-red-500/10",    border: "border-red-500/30",    text: "text-red-400",    dot: "bg-red-400" },
  B: { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-400", dot: "bg-orange-400" },
  C: { bg: "bg-yellow-500/10", border: "border-yellow-500/30", text: "text-yellow-400", dot: "bg-yellow-400" },
  D: { bg: "bg-brand/10",      border: "border-brand/30",      text: "text-brand",      dot: "bg-brand" },
  E: { bg: "bg-sky-500/10",    border: "border-sky-500/30",    text: "text-sky-400",    dot: "bg-sky-400" },
  F: { bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-400", dot: "bg-purple-400" },
};

// ── Twitter avatar ────────────────────────────────────────────────────────────

function TwitterCardAvatar({ username, logoUrl }: { username: string; logoUrl: string }) {
  const [errored, setErrored] = useState(false);
  if (!errored) {
    return (
      <img src={logoUrl} alt={username}
        className="w-10 h-10 rounded-full object-cover shrink-0"
        onError={() => setErrored(true)} />
    );
  }
  return (
    <div className="w-10 h-10 rounded-full bg-[#1d9bf0] flex items-center justify-center shrink-0">
      <span className="text-white font-bold text-base leading-none">{username[0]?.toUpperCase() ?? "?"}</span>
    </div>
  );
}

// ── MiniSparkline ─────────────────────────────────────────────────────────────

function MiniSparkline({ data, width = 80, height = 32 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2) return <div style={{ width, height }} className="shrink-0" />;
  const min   = Math.min(...data);
  const max   = Math.max(...data);
  const range = max - min || min * 0.01 || 1;
  const positive = data[data.length - 1] >= data[0];
  const color    = positive ? "#22c55e" : "#ef4444";
  const pad      = height * 0.1;
  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * width,
    y: pad + (1 - (v - min) / range) * (height - pad * 2),
  }));
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const dx  = (pts[i].x - pts[i - 1].x) / 2.5;
    const cp1 = `${(pts[i - 1].x + dx).toFixed(1)} ${pts[i - 1].y.toFixed(1)}`;
    const cp2 = `${(pts[i].x - dx).toFixed(1)} ${pts[i].y.toFixed(1)}`;
    d += ` C ${cp1} ${cp2} ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`;
  }
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0 overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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

function fmtPrice(p: number): string {
  if (p >= 1000) return `$${Math.round(p).toLocaleString("en-US")}`;
  if (p >= 1)    return `$${p.toFixed(4)}`;
  if (p >= 0.01) return `$${p.toFixed(6)}`;
  return `$${p.toFixed(8)}`;
}

function fmtMcap(v: number): string {
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3)  return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${n.toLocaleString("en-US")}`;
  return `$${n.toFixed(2)}`;
}

// ── Live stats hook ───────────────────────────────────────────────────────────

interface LiveStats {
  price:   number | null;
  mcap:    number | null;
  history: number[];
}

function useLiveStats(
  round: { targetToken?: string | null; tokenAddress?: string | null; questionType?: string | null },
  liveData?: LiveData,
): LiveStats {
  const [stats, setStats] = useState<LiveStats>({ price: null, mcap: null, history: [] });
  const pushRef = useRef<(p: number, m: number | null) => void>(() => { /**/ });

  pushRef.current = (p: number, m: number | null) => {
    setStats(prev => {
      const last = prev.history[prev.history.length - 1];
      if (last === p) return prev;
      return { price: p, mcap: m, history: [...prev.history, p].slice(-20) };
    });
  };

  // BTC/SOL from liveData WebSocket ticks
  useEffect(() => {
    if (!round.targetToken || !liveData) return;
    const isBtc = round.targetToken === "bitcoin";
    const isSol = round.targetToken === "solana";
    const asset  = isBtc ? liveData.btc : isSol ? liveData.sol : undefined;
    if (!asset) return;
    pushRef.current(asset.price, null);
  }, [round.targetToken, liveData]);

  // Custom token — DexScreener every 10s
  useEffect(() => {
    if (!round.tokenAddress || round.targetToken) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(
          `https://api.dexscreener.com/latest/dex/tokens/${round.tokenAddress}`,
          { cache: "no-store" }
        );
        if (!res.ok || cancelled) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = await res.json() as { pairs?: any[] };
        const pairs = data.pairs ?? [];
        if (!pairs.length || cancelled) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pairs.sort((a: any, b: any) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0));
        const pair  = pairs[0];
        const price = parseFloat(pair.priceUsd ?? "0");
        const mcap  = pair.marketCap ?? null;
        if (isFinite(price) && price > 0 && !cancelled) pushRef.current(price, mcap);
      } catch { /**/ }
    };

    poll();
    const id = setInterval(poll, 10_000);
    return () => { cancelled = true; clearInterval(id); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round.tokenAddress, round.targetToken]);

  return stats;
}

// ── Resolved card ─────────────────────────────────────────────────────────────

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
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-1.5">
            {round.roundNumber != null && (
              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-mono text-muted bg-surface-3 border border-surface-3/60">
                #{round.roundNumber}
              </span>
            )}
            <span className={`inline-flex px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border ${CATEGORY_STYLES[round.category] ?? "bg-surface-3 text-muted border-transparent"}`}>
              {CATEGORY_LABELS[round.category] ?? round.category}
            </span>
            {round.isPumpFun && (
              <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold border bg-gradient-to-r from-orange-500/10 to-green-500/10 text-orange-400 border-orange-500/20">
                pump.fun
              </span>
            )}
          </div>
          {winning && colors && (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${colors.bg} ${colors.text} ${colors.border}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
              {round.winningOutcome} WON
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5 mb-2">
          {round.twitterUsername && round.tokenLogo ? (
            <div className="flex flex-col items-center gap-0.5 shrink-0">
              <TwitterCardAvatar username={round.twitterUsername} logoUrl={round.tokenLogo} />
              <span className="text-[9px] text-[#1d9bf0] font-mono leading-none">@{round.twitterUsername}</span>
            </div>
          ) : round.customImage ? (
            <img src={round.customImage} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
          ) : round.targetToken && TOKEN_LOGOS[round.targetToken] ? (
            <img src={TOKEN_LOGOS[round.targetToken]} alt={round.targetToken} className="w-8 h-8 rounded-full shrink-0" />
          ) : null}
          <p className="text-white/80 text-sm font-medium leading-snug truncate">{round.question}</p>
        </div>

        {winning && (
          <p className={`text-xs mb-3 font-mono ${colors?.text ?? "text-muted"}`}>
            Result: {winning.label} ✓
          </p>
        )}

        <div className="grid grid-cols-2 gap-1 mb-3">
          {outcomes.map(o => {
            const isWinner = o.id === round.winningOutcome;
            const c        = OUTCOME_COLORS[o.id];
            return (
              <div
                key={o.id}
                className={`rounded-lg px-2 py-1 border text-[10px] ${
                  isWinner ? `${c.bg} ${c.border} ${c.text}` : "bg-surface-2 border-surface-3 text-muted"
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
          <span>Pool: <span className="text-white font-mono">{(round.realPool ?? 0).toFixed(2)} DORA</span></span>
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

export default function RangeCard({ round, liveData }: RangeCardProps) {
  const router           = useRouter();
  const resultCountdown  = useCountdown(round.endsAt);
  const bettingCountdown = useCountdown(round.bettingClosesAt ?? round.endsAt);
  const liveStats        = useLiveStats(round, liveData);

  const outcomes      = round.outcomes ?? [];
  const isEnded       = round.status !== "open";
  const bettingClosed = round.bettingClosesAt
    ? new Date() > new Date(round.bettingClosesAt)
    : isEnded;

  const hasChart   = round.targetToken === "bitcoin" || round.targetToken === "solana";
  const isMcapQ    = round.questionType === "mcap" || round.questionType === "ath_mcap";
  const isCrypto   = round.category === "crypto";
  const [prices, setPrices] = useState<Record<string, number>>({});

  const fetchPrices = useCallback(async () => {
    try {
      const res = await fetch(`/api/trade?roundId=${round.id}`, { cache: "no-store" });
      if (res.ok) setPrices((await res.json()).prices ?? {});
    } catch { /* ignore */ }
  }, [round.id]);

  useEffect(() => { fetchPrices(); }, [fetchPrices]);

  if (round.status === "resolved") return <ResolvedRangeCard round={round} />;

  // Derived info-box values
  const displayValue = isMcapQ && liveStats.mcap != null
    ? liveStats.mcap
    : liveStats.price;
  const changeVal = liveStats.history.length >= 2
    ? (liveStats.history[liveStats.history.length - 1] - liveStats.history[0]) / liveStats.history[0] * 100
    : null;
  const showInfoBox = isCrypto && displayValue != null && displayValue > 0;

  return (
    <div
      className="bg-surface rounded-xl border border-surface-3 overflow-hidden flex flex-col hover:border-surface-2 transition-colors cursor-pointer"
      onClick={() => router.push(`/rounds/${round.id}`)}
    >
      <div className="p-4 flex-1">

        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            {round.roundNumber != null && (
              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-mono text-muted bg-surface-3 border border-surface-3/60">
                #{round.roundNumber}
              </span>
            )}
            <span className={`inline-flex px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border ${CATEGORY_STYLES[round.category] ?? "bg-surface-3 text-muted border-transparent"}`}>
              {CATEGORY_LABELS[round.category] ?? round.category}
            </span>
            {round.isPumpFun && (
              <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold border bg-gradient-to-r from-orange-500/10 to-green-500/10 text-orange-400 border-orange-500/20">
                pump.fun
              </span>
            )}
          </div>
          {!isEnded && (
            <div className="text-right shrink-0">
              {!bettingClosed ? (
                <>
                  <p className="text-[10px] text-[#22c55e]/60 uppercase tracking-wider">Closes in</p>
                  <p className="text-sm font-mono font-bold text-[#22c55e] tabular-nums leading-tight">{bettingCountdown}</p>
                  <p className="text-[10px] text-white/30 font-mono tabular-nums mt-0.5">result {resultCountdown}</p>
                </>
              ) : (
                <>
                  <p className="text-[10px] text-white/40 uppercase tracking-wider">Result in</p>
                  <p className="text-lg font-mono font-bold text-white/80 tabular-nums leading-tight">{resultCountdown}</p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Question — single line, truncated */}
        <div className="flex items-center gap-2.5 mb-2.5 min-w-0">
          {round.twitterUsername && round.tokenLogo ? (
            <div className="flex flex-col items-center gap-0.5 shrink-0">
              <TwitterCardAvatar username={round.twitterUsername} logoUrl={round.tokenLogo} />
              <span className="text-[9px] text-[#1d9bf0] font-mono leading-none">@{round.twitterUsername}</span>
            </div>
          ) : round.customImage ? (
            <img src={round.customImage} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
          ) : round.targetToken && TOKEN_LOGOS[round.targetToken] ? (
            <img src={TOKEN_LOGOS[round.targetToken]} alt={round.targetToken} className="w-8 h-8 rounded-full shrink-0" />
          ) : null}
          <p className="text-white text-sm font-medium truncate">{round.question}</p>
        </div>

        {/* Price / mcap info box */}
        {showInfoBox && (
          <div className="flex items-center justify-between px-3 py-2 bg-white/[0.03] rounded-lg mb-2 border border-white/5">
            <div>
              <div className="text-[9px] text-white/30 uppercase tracking-wider mb-0.5">
                {isMcapQ ? "Market Cap" : "Price"}
              </div>
              <div className="text-sm font-mono font-bold text-white leading-tight">
                {isMcapQ && liveStats.mcap != null
                  ? fmtMcap(liveStats.mcap)
                  : liveStats.price != null
                  ? fmtPrice(liveStats.price)
                  : "—"}
              </div>
              {changeVal != null && (
                <div className={`text-[10px] font-mono mt-0.5 ${changeVal >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {changeVal >= 0 ? "+" : ""}{changeVal.toFixed(2)}%
                </div>
              )}
            </div>
            <MiniSparkline data={liveStats.history} width={80} height={32} />
          </div>
        )}

        {/* Outcome grid — compact */}
        <div className="grid grid-cols-2 gap-1 mb-1.5">
          {outcomes.map((o) => {
            const c   = OUTCOME_COLORS[o.id];
            const pct = prices[o.id] != null ? (prices[o.id] * 100).toFixed(1) : null;
            return (
              <button
                key={o.id}
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/rounds/${round.id}?outcome=${o.id}`);
                }}
                disabled={bettingClosed}
                className={`flex items-center justify-between gap-1 px-2 py-1 rounded-lg border text-left transition-all
                  ${bettingClosed
                    ? "opacity-40 cursor-not-allowed bg-surface-2 border-surface-3"
                    : `${c.bg} ${c.border} hover:opacity-90 active:scale-[0.98]`}`}
              >
                <div className="flex items-center gap-1 min-w-0">
                  <span className={`w-4 h-4 text-[9px] font-bold flex items-center justify-center rounded shrink-0 ${c.bg} ${c.text} border ${c.border}`}>
                    {o.id}
                  </span>
                  <span className="text-[11px] font-medium text-white/80 leading-tight truncate">{o.label}</span>
                </div>
                {pct !== null
                  ? <span className={`text-[10px] font-mono font-bold shrink-0 ${c.text}`}>{pct}%</span>
                  : <span className="text-[10px] text-muted font-mono shrink-0">—</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 pb-3 border-t border-surface-3/50 pt-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted">{outcomes.length} outcomes · LMSR</span>
          {hasChart && (
            <span className="flex items-center gap-1 text-[10px] text-brand">
              View Chart
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
