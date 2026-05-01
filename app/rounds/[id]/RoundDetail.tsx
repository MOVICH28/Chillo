"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import LMSRBetPanel from "@/components/LMSRBetPanel";
import { getAllPrices } from "@/lib/lmsr";
import dynamic from "next/dynamic";
import { Outcome } from "@/lib/types";
import { useTokenPrice, Timeframe } from "@/lib/useTokenPrice";
import { useAuth } from "@/lib/useAuth";
import TokenStats from "@/components/TokenStats";
import Sidebar from "@/components/Sidebar";

const CandleChart   = dynamic(() => import("@/components/CandleChart"),   { ssr: false });
const BettingChart  = dynamic(() => import("@/components/BettingChart"),  { ssr: false });

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
  shares: Record<string, number> | null;
  lmsrB: number;
  yesPool: number;
  noPool: number;
  totalPool: number;
  realPool: number;
  roundNumber:  number | null;
  tokenAddress:    string | null;
  tokenSymbol:     string | null;
  tokenLogo:       string | null;
  isCustom:        boolean;
  isPumpFun:       boolean;
  questionType:    string | null;
  customImage:     string | null;
  twitterUsername:  string | null;
  creatorUsername:  string | null;
  creatorAvatarUrl: string | null;
  totalVolume?:     number;
  description:      string | null;
  twitterUrl:       string | null;
  tokenBattleTokens?: Array<{
    address: string; symbol: string; name: string;
    logoUrl: string | null; currentMcap: number; outcomeId: string;
  }> | null;
}

interface RecentTrade {
  id: string;
  username: string | null;
  avatarUrl: string | null;
  outcome: string;
  type: "buy" | "sell";
  totalCost: number;
  profitLoss: number | null;
  createdAt: string;
}

interface Comment {
  id: string;
  text: string;
  createdAt: string;
  username: string;
  userId: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TOKEN_LOGOS: Record<string, string> = {
  bitcoin: "https://assets.coingecko.com/coins/images/1/small/bitcoin.png",
  solana:  "https://assets.coingecko.com/coins/images/4128/small/solana.png",
};

const OUTCOME_COLORS: Record<string, { bg: string; border: string; text: string; dot: string; hex: string }> = {
  A: { bg: "bg-red-500/10",    border: "border-red-500/40",    text: "text-red-400",    dot: "bg-red-400",    hex: "#f87171" },
  B: { bg: "bg-orange-500/10", border: "border-orange-500/40", text: "text-orange-400", dot: "bg-orange-400", hex: "#fb923c" },
  C: { bg: "bg-yellow-500/10", border: "border-yellow-500/40", text: "text-yellow-400", dot: "bg-yellow-400", hex: "#facc15" },
  D: { bg: "bg-green-500/10",  border: "border-green-500/40",  text: "text-green-400",  dot: "bg-green-400",  hex: "#4ade80" },
  E: { bg: "bg-sky-500/10",    border: "border-sky-500/40",    text: "text-sky-400",    dot: "bg-sky-400",    hex: "#38bdf8" },
  F: { bg: "bg-purple-500/10", border: "border-purple-500/40", text: "text-purple-400", dot: "bg-purple-400", hex: "#c084fc" },
};

// ── Twitter avatar with unavatar.io + letter fallback ────────────────────────

function TwitterAvatar({ username, logoUrl, size }: { username: string; logoUrl: string | null; size: number }) {
  const [errored, setErrored] = useState(false);
  const src = logoUrl ?? `https://unavatar.io/twitter/${username}`;
  if (!errored) {
    return (
      <img
        src={src}
        alt={username}
        width={size}
        height={size}
        className="rounded-full shrink-0 object-cover"
        onError={() => setErrored(true)}
      />
    );
  }
  return (
    <div
      className="rounded-full bg-[#1d9bf0] flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <span className="text-white font-bold leading-none" style={{ fontSize: size * 0.4 }}>
        {username[0]?.toUpperCase() ?? "?"}
      </span>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCountdown(ms: number): string {
  if (ms <= 0) return "00:00";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function useCountdown(target: string | null): string {
  const [display, setDisplay] = useState("");
  useEffect(() => {
    if (!target) return;
    const calc = () => setDisplay(formatCountdown(new Date(target).getTime() - Date.now()));
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [target]);
  return display;
}

function timeAgo(dateStr: string): string {
  const mins = Math.round((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins === 0) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Timeframe config ─────────────────────────────────────────────────────────

const TIMEFRAMES: { key: Timeframe; label: string }[] = [
  { key: "1s",  label: "1s"  },
  { key: "5s",  label: "5s"  },
  { key: "30s", label: "30s" },
  { key: "1m",  label: "1m"  },
  { key: "5m",  label: "5m"  },
  { key: "15m", label: "15m" },
  { key: "30m", label: "30m" },
  { key: "1h",  label: "1h"  },
  { key: "4h",  label: "4h"  },
  { key: "6h",  label: "6h"  },
  { key: "24h", label: "24h" },
];

// ── Live chart ────────────────────────────────────────────────────────────────

function LiveChart({ targetToken, tokenAddress, tokenSymbol, priceToBeat, timeframe, chartType, showMcap }: {
  targetToken?:  string | null;
  tokenAddress?: string | null;
  tokenSymbol?:  string | null;
  priceToBeat:   number | null;
  timeframe:     Timeframe;
  chartType:     "line" | "candles" | "live";
  showMcap?:     boolean;
}) {
  const { history, status, label, isKline } = useTokenPrice({
    targetToken, tokenAddress, tokenSymbol, timeframe, showMcap,
  });

  return (
    <CandleChart
      data={history}
      chartType={chartType as "line" | "candles" | "live"}
      isKline={isKline}
      priceToBeat={showMcap ? null : priceToBeat}
      timeframe={timeframe}
      status={status}
      label={label}
      showMcap={showMcap}
    />
  );
}

// ── Token Battle ──────────────────────────────────────────────────────────────

type BattleTokenInfo = {
  address: string; symbol: string; name: string;
  logoUrl: string | null; currentMcap: number; outcomeId: string;
};

function fmtMcapBattle(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function useBattleTokenLive(address: string, initialMcap: number) {
  const [mcap, setMcap] = useState(initialMcap);
  const [history, setHistory] = useState<number[]>(initialMcap > 0 ? [initialMcap] : []);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res  = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = await res.json() as { pairs?: any[] };
        const pairs = (data.pairs ?? []).sort((a: any, b: any) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0));
        const pair  = pairs[0];
        if (!pair || cancelled) return;
        const m = pair.marketCap ?? pair.fdv ?? 0;
        if (m > 0 && !cancelled) {
          setMcap(m);
          setHistory(prev => [...prev, m].slice(-40));
        }
      } catch { /* ignore */ }
    }
    poll();
    const id = setInterval(poll, 5_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [address]);

  return { mcap, history };
}

function BattleSparkline({ history, color }: { history: number[]; color: string }) {
  if (history.length < 2) return <div style={{ width: 72, height: 28 }} />;
  const min = Math.min(...history), max = Math.max(...history);
  const range = max - min || min * 0.01 || 1;
  const W = 72, H = 28, pad = 3;
  const pts = history.map((v, i) => ({
    x: (i / (history.length - 1)) * W,
    y: pad + (1 - (v - min) / range) * (H - pad * 2),
  }));
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const dx = (pts[i].x - pts[i - 1].x) / 2.5;
    d += ` C ${(pts[i-1].x + dx).toFixed(1)} ${pts[i-1].y.toFixed(1)} ${(pts[i].x - dx).toFixed(1)} ${pts[i].y.toFixed(1)} ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`;
  }
  return (
    <svg width={W} height={H} className="shrink-0 overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BattleTokenCard({ token, color, rank }: { token: BattleTokenInfo; color: typeof OUTCOME_COLORS[string]; rank?: string }) {
  const { mcap, history }    = useBattleTokenLive(token.address, token.currentMcap);
  const [copied, setCopied]  = useState(false);
  const trend = history.length >= 2
    ? (history[history.length - 1] - history[0]) / history[0] * 100
    : 0;

  return (
    <div className={`flex-1 min-w-[148px] max-w-[220px] p-3 rounded-xl border ${color.border} ${color.bg}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        {token.logoUrl
          ? <img src={token.logoUrl} alt={token.symbol} className="w-7 h-7 rounded-full shrink-0" />
          : <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${color.bg} ${color.text}`}>{token.symbol[0]}</div>}
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-bold leading-tight ${color.text}`}>${token.symbol}</p>
          <p className="text-[9px] text-white/40 truncate leading-tight">{token.name}</p>
        </div>
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          {rank && <span className="text-[10px] leading-none">{rank}</span>}
          <span className={`text-[9px] font-bold px-1 py-0.5 rounded border ${color.bg} ${color.text} ${color.border}`}>
            {token.outcomeId}
          </span>
        </div>
      </div>

      {/* Mcap + sparkline */}
      <div className="flex items-end justify-between gap-1 mb-2">
        <div>
          <p className="text-[8px] text-white/25 uppercase tracking-wider leading-tight">Mcap</p>
          <p className="text-sm font-mono font-bold text-white leading-tight">
            {mcap > 0 ? fmtMcapBattle(mcap) : "—"}
          </p>
          {history.length >= 2 && (
            <p className={`text-[9px] font-mono leading-tight ${trend >= 0 ? "text-green-400" : "text-red-400"}`}>
              {trend >= 0 ? "+" : ""}{trend.toFixed(2)}%
            </p>
          )}
        </div>
        <BattleSparkline history={history} color={color.hex} />
      </div>

      {/* Address + links */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => { navigator.clipboard.writeText(token.address); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="flex items-center gap-0.5 text-[9px] font-mono text-white/25 hover:text-white/50 transition-colors"
        >
          {token.address.slice(0, 4)}…{token.address.slice(-4)}
          {copied
            ? <span className="text-green-400 ml-0.5">✓</span>
            : <svg className="w-2 h-2 ml-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>}
        </button>
        <a href={`https://pump.fun/coin/${token.address}`} target="_blank" rel="noopener noreferrer"
           className="text-[9px] text-orange-400/50 hover:text-orange-400 transition-colors">
          pump.fun ↗
        </a>
      </div>
    </div>
  );
}

function TokenBattleSection({ tokens }: { tokens: BattleTokenInfo[] }) {
  // Sort by stored mcap descending (leader first); live values update within cards
  const sorted = [...tokens].sort((a, b) => (b.currentMcap ?? 0) - (a.currentMcap ?? 0));
  const RANK_LABELS = ["🥇", "🥈", "🥉", "4th", "5th", "6th"];
  return (
    <div className="mb-4">
      <p className="text-[10px] uppercase tracking-widest text-white/30 mb-2">⚔️ Token Battle</p>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {sorted.map((t, i) => (
          <BattleTokenCard key={t.address} token={t} color={OUTCOME_COLORS[t.outcomeId] ?? OUTCOME_COLORS.A} rank={RANK_LABELS[i] ?? `${i + 1}`} />
        ))}
      </div>
    </div>
  );
}

// ── Token Battle multi-line comparison chart ──────────────────────────────────

const BATTLE_COLORS = ["#f87171","#fb923c","#facc15","#4ade80","#38bdf8","#c084fc"];

function TokenBattleChart({ tokens }: { tokens: BattleTokenInfo[] }) {
  const [series, setSeries] = useState<number[][]>(() =>
    tokens.map(t => t.currentMcap > 0 ? [t.currentMcap] : [])
  );

  useEffect(() => {
    let cancelled = false;
    async function pollAll() {
      const updates = await Promise.all(tokens.map(async (t, i) => {
        try {
          const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${t.address}`, { cache: "no-store" });
          if (!res.ok || cancelled) return { i, m: 0 };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data = await res.json() as { pairs?: any[] };
          const pairs = (data.pairs ?? []).sort((a: any, b: any) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0));
          const m = pairs[0]?.marketCap ?? pairs[0]?.fdv ?? 0;
          return { i, m };
        } catch { return { i, m: 0 }; }
      }));
      if (cancelled) return;
      setSeries(prev => {
        const next = prev.map(s => [...s]);
        updates.forEach(({ i, m }) => { if (m > 0) next[i] = [...next[i], m].slice(-60); });
        return next;
      });
    }
    pollAll();
    const id = setInterval(pollAll, 10_000);
    return () => { cancelled = true; clearInterval(id); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maxLen = Math.max(...series.map(s => s.length), 1);
  const W = 320, H = 130, padL = 44, padR = 6, padT = 10, padB = 8;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const allVals = series.flat().filter(v => v > 0);
  const rawMin = allVals.length > 0 ? Math.min(...allVals) : 0;
  const rawMax = allVals.length > 0 ? Math.max(...allVals) : 1;
  const pad5   = (rawMax - rawMin) * 0.05 || rawMax * 0.05 || 1;
  const yMin   = rawMin - pad5;
  const yMax   = rawMax + pad5;
  const yRange = yMax - yMin || 1;

  function toX(idx: number, seriesLen: number): number {
    if (seriesLen <= 1) return padL + innerW / 2;
    return padL + (idx / (Math.max(maxLen, seriesLen) - 1)) * innerW;
  }
  function toY(val: number): number {
    return padT + (1 - (val - yMin) / yRange) * innerH;
  }

  const hasData = series.some(s => s.length >= 2);
  const yTicks  = [yMax, (yMax + yMin) / 2, yMin];
  const currentMcaps = series.map(s => s.length > 0 ? s[s.length - 1] : 0);

  return (
    <div className="mb-4 rounded-xl border border-white/5 bg-white/[0.02] p-3">
      <span className="text-[10px] text-white/30 uppercase tracking-wider">Market Cap</span>
      {!hasData ? (
        <div className="flex items-center justify-center mt-2" style={{ height: H }}>
          <span className="text-white/20 text-xs">Collecting data…</span>
        </div>
      ) : (
        <>
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible mt-2">
            {/* Y-axis gridlines + labels */}
            {yTicks.map((v, ti) => (
              <g key={ti}>
                <line x1={padL} y1={toY(v)} x2={W - padR} y2={toY(v)} stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="3 3" />
                <text x={padL - 3} y={toY(v) + 3} fontSize="7" fill="rgba(255,255,255,0.35)" textAnchor="end">
                  {fmtMcapBattle(v)}
                </text>
              </g>
            ))}
            {/* Series lines */}
            {series.map((pts, i) => {
              if (pts.length < 2) return null;
              const color = BATTLE_COLORS[i % BATTLE_COLORS.length];
              const sw    = i === 0 ? 2.5 : i === 1 ? 2 : 1.5;
              let d = `M ${toX(0, pts.length).toFixed(1)} ${toY(pts[0]).toFixed(1)}`;
              for (let j = 1; j < pts.length; j++) {
                const x0 = toX(j - 1, pts.length), y0 = toY(pts[j - 1]);
                const x1 = toX(j, pts.length),     y1 = toY(pts[j]);
                const dx = (x1 - x0) / 3;
                d += ` C ${(x0 + dx).toFixed(1)} ${y0.toFixed(1)} ${(x1 - dx).toFixed(1)} ${y1.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
              }
              const lx = toX(pts.length - 1, pts.length);
              const ly = toY(pts[pts.length - 1]);
              return (
                <g key={i}>
                  <path d={d} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx={lx} cy={ly} r="2.5" fill={color} />
                </g>
              );
            })}
          </svg>
          {/* Legend: dot + $SYMBOL + current mcap */}
          <div className="flex items-center gap-3 flex-wrap mt-1">
            {tokens.map((t, i) => (
              <div key={t.address} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: BATTLE_COLORS[i % BATTLE_COLORS.length] }} />
                <span className="text-[9px] font-bold font-mono" style={{ color: BATTLE_COLORS[i % BATTLE_COLORS.length] }}>${t.symbol}</span>
                {currentMcaps[i] > 0 && (
                  <span className="text-[9px] font-mono text-white/40">{fmtMcapBattle(currentMcaps[i])}</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Pool distribution bar (LMSR probabilities) ───────────────────────────────

function PoolBar({ outcomes, prices, tokenLogoMap }: { outcomes: Outcome[]; prices: Record<string, number>; tokenLogoMap?: Record<string, { symbol: string; logoUrl: string | null }> }) {
  const hasPrices = outcomes.some(o => prices[o.id] != null);
  if (!hasPrices) {
    return (
      <div className="mt-3 rounded-xl border border-white/5 bg-white/[0.02] p-4">
        <p className="text-xs text-white/30 text-center">No trades yet — be the first!</p>
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-xl border border-white/5 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-white/30 uppercase tracking-wider">Market Probabilities</span>
        <span className="text-[10px] text-white/20 uppercase tracking-wider">LMSR</span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden gap-px">
        {outcomes.map(o => {
          const pct = (prices[o.id] ?? 0) * 100;
          if (pct < 0.1) return null;
          return <div key={o.id} className={OUTCOME_COLORS[o.id].dot} style={{ width: `${pct}%` }} title={`${o.id}: ${pct.toFixed(1)}%`} />;
        })}
      </div>
      <div className="flex justify-between mt-2">
        {outcomes.map(o => {
          const pct = (prices[o.id] ?? 0) * 100;
          const c   = OUTCOME_COLORS[o.id];
          const tok = tokenLogoMap?.[o.id];
          return (
            <div key={o.id} className="text-center flex flex-col items-center gap-0.5">
              {tok ? (
                tok.logoUrl
                  ? <img src={tok.logoUrl} alt={tok.symbol} className="w-4 h-4 rounded-full" />
                  : <div className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center text-[7px] font-bold text-white/50">{tok.symbol[0]}</div>
              ) : (
                <div className={`text-[10px] font-bold ${c.text}`}>{o.id}</div>
              )}
              <div className="text-[9px] text-white/30">{pct.toFixed(0)}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Activity tab — trades list ────────────────────────────────────────────────

function ActivityTab({ recentTrades }: { recentTrades: RecentTrade[] }) {
  if (recentTrades.length === 0) {
    return <p className="text-white/20 text-xs text-center py-8">No trades yet — be the first!</p>;
  }
  return (
    <div className="divide-y divide-white/5 max-h-[300px] overflow-y-auto">
      {recentTrades.map(trade => {
        const c = OUTCOME_COLORS[trade.outcome] ?? { text: "text-white/30", bg: "bg-white/5", border: "border-white/10", dot: "bg-white/20", hex: "#fff" };
        const isBuy   = trade.type === "buy";
        const doraAmt = isBuy ? trade.totalCost : -trade.totalCost;

        return (
          <div key={trade.id} className="flex items-center gap-2 py-2 text-xs">
            {trade.username ? (
              <Link href={`/profile/${trade.username}`} className="flex items-center gap-1.5 shrink-0 group min-w-0">
                <Avatar username={trade.username} avatarUrl={trade.avatarUrl} size={20} />
                <span className="text-white/50 font-mono truncate max-w-[72px] group-hover:text-[#22c55e] transition-colors">
                  {trade.username}
                </span>
              </Link>
            ) : (
              <span className="text-white/20 font-mono shrink-0">anon</span>
            )}

            <span className={`px-1.5 py-px rounded text-[10px] font-bold shrink-0
              ${isBuy ? "bg-[#22c55e]/15 text-[#22c55e]" : "bg-red-500/15 text-red-400"}`}>
              {isBuy ? "BUY" : "SELL"}
            </span>

            <span className={`px-1.5 py-px rounded text-[10px] font-bold border shrink-0 ${c.bg} ${c.text} ${c.border}`}>
              {trade.outcome}
            </span>

            <span className="flex-1" />

            <div className="flex flex-col items-end shrink-0">
              <span className="font-mono text-white/80">{doraAmt.toFixed(2)} DORA</span>
              {!isBuy && trade.profitLoss !== null && (
                <span className={`text-[10px] font-mono font-semibold ${trade.profitLoss >= 0 ? "text-[#22c55e]" : "text-red-400"}`}>
                  {trade.profitLoss >= 0 ? "+" : ""}{trade.profitLoss.toFixed(2)}
                </span>
              )}
            </div>

            <span className="text-white/20 shrink-0 w-12 text-right">{timeAgo(trade.createdAt)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Comments section ──────────────────────────────────────────────────────────

function CommentsSection({ roundId }: { roundId: string }) {
  const { user, getToken } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/rounds/${roundId}/comments`);
      if (res.ok) setComments(await res.json());
    } catch { /* ignore */ }
  }, [roundId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setPosting(true);
    setError("");
    try {
      const token = getToken();
      const res = await fetch(`/api/rounds/${roundId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to post");
      setComments(prev => [data, ...prev]);
      setText("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to post comment");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div>

      {user ? (
        <form onSubmit={handlePost} className="mb-4">
          <div className="flex gap-2 items-start">
            <div className="w-7 h-7 rounded-full bg-brand/20 border border-brand/30 flex items-center justify-center text-brand font-bold text-xs shrink-0">
              {user.username.slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1">
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Share your thoughts…"
                maxLength={500}
                rows={2}
                className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-surface-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-brand transition-colors resize-none"
              />
              {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[10px] text-white/20">{text.length}/500</span>
                <button type="submit" disabled={posting || !text.trim()}
                  className="px-4 py-1.5 rounded-lg bg-brand hover:bg-brand-dim text-black font-semibold text-xs disabled:opacity-40 transition-colors">
                  {posting ? "Posting…" : "Post"}
                </button>
              </div>
            </div>
          </div>
        </form>
      ) : (
        <p className="text-white/30 text-xs mb-4">Login to join the discussion.</p>
      )}

      {comments.length === 0 ? (
        <p className="text-white/20 text-xs text-center py-6">No comments yet — start the conversation!</p>
      ) : (
        <div className="divide-y divide-white/5">
          {comments.map(c => (
            <div key={c.id} className="py-3 flex gap-2.5">
              <Avatar username={c.username} size={28} className="shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-0.5">
                  <Link href={`/profile/${c.username}`}
                    className="text-xs font-semibold text-white/70 hover:text-[#22c55e] hover:underline transition-colors">
                    @{c.username}
                  </Link>
                  <span className="text-[10px] text-white/20">{timeAgo(c.createdAt)}</span>
                </div>
                <p className="text-sm text-white/70 break-words">{c.text}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RoundDetail({ initialRound }: { initialRound: RoundData }) {
  const searchParams    = useSearchParams();
  const initialOutcome  = searchParams.get("outcome");
  const betPanelRef     = useRef<HTMLDivElement>(null);

  const [round, setRound]               = useState<RoundData>(initialRound);
  const [recentTrades, setRecentTrades] = useState<RecentTrade[]>([]);
  const [copied, setCopied]             = useState(false);
  const [activeTab, setActiveTab]       = useState<"discussion" | "activity">("discussion");
  const [timeframe, setTimeframe]       = useState<Timeframe>("1s");
  const [chartType, setChartType]       = useState<"line" | "candles" | "live">("live");
  const [tfOpen, setTfOpen]             = useState(false);
  const tfRef                           = useRef<HTMLDivElement>(null);
  const [lmsrPrices, setLmsrPrices]     = useState<Record<string, number>>(() => {
    const outcomes = (initialRound.outcomes ?? []).map(o => o.id);
    return getAllPrices(initialRound.shares ?? {}, initialRound.lmsrB, outcomes);
  });

  const resultCountdown  = useCountdown(round.endsAt);
  const bettingCountdown = useCountdown(round.bettingClosesAt ?? round.endsAt);

  const outcomes      = round.outcomes ?? [];
  const bettingClosed = round.bettingClosesAt
    ? new Date() > new Date(round.bettingClosesAt)
    : round.status !== "open";

  const hasToken      = !!(round.targetToken || round.tokenAddress || round.tokenSymbol);
  const isCustomToken = !!round.tokenAddress && !round.targetToken;

  // Streaming timeframes only make sense with Binance WebSocket (Live mode).
  // For custom tokens in Line/Candles, hide 1s/5s/30s and default to 5m.
  const availableTimeframes = isCustomToken && chartType !== "live"
    ? TIMEFRAMES.filter(tf => !["1s", "5s", "30s"].includes(tf.key))
    : TIMEFRAMES;

  const refreshRound = useCallback(async () => {
    try {
      const res  = await fetch(`/api/rounds/${round.id}`);
      if (!res.ok) return;
      const data = await res.json();
      setRound(data);
      setRecentTrades(data.recentTrades ?? []);
      const activeOutcomes = ((data.outcomes ?? []) as Outcome[]).map((o: Outcome) => o.id);
      setLmsrPrices(getAllPrices(data.shares ?? {}, data.lmsrB, activeOutcomes));
    } catch { /* ignore */ }
  }, [round.id]);

  useEffect(() => {
    refreshRound();
    const id = setInterval(refreshRound, 5_000);
    return () => clearInterval(id);
  }, [refreshRound]);

  // Scroll to bet panel if outcome pre-selected from URL
  useEffect(() => {
    if (initialOutcome && betPanelRef.current) {
      setTimeout(() => betPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
    }
  }, [initialOutcome]);

  // Close timeframe dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (tfRef.current && !tfRef.current.contains(e.target as Node)) setTfOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleShare() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const resolvedDate = round.resolvedAt
    ? new Date(round.resolvedAt).toLocaleString("en-GB", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : null;

  return (
    <div className="min-h-screen bg-base text-white">
      <div className="flex flex-row gap-3 max-w-[1400px] mx-auto w-full px-2 mt-14">

        {/* Left Sidebar */}
        <div className="hidden lg:block w-40 shrink-0 overflow-y-auto py-6 no-scrollbar sticky top-14 self-start">
          <Sidebar active={round.category} onSelect={() => {}} counts={{}} />
        </div>

        {/* Main content */}
        <main className="min-w-0 flex-1 py-6">

            {/* Back arrow */}
            <Link href="/" className="flex items-center text-white/40 hover:text-white/70 transition-colors mb-4 w-fit">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>

            {/* Question + status badges */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {round.roundNumber != null && (
                <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-mono text-muted bg-surface-3 border border-surface-3/60">
                  #{round.roundNumber}
                </span>
              )}
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
                Crypto
              </span>
              {round.isPumpFun && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-gradient-to-r from-orange-500/10 to-green-500/10 text-orange-400 border-orange-500/20">
                  pump.fun
                </span>
              )}
              {round.questionType === "token_battle" && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-purple-500/10 text-purple-400 border-purple-500/20">
                  ⚔️ Token Battle
                </span>
              )}
              {round.status === "resolved" ? (
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border bg-white/5 text-white/30 border-white/10">
                  Resolved {resolvedDate}
                </span>
              ) : bettingClosed ? (
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border bg-red-500/10 text-red-400 border-red-500/20">
                  Awaiting Result
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border bg-[#22c55e]/10 text-[#22c55e] border-[#22c55e]/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
                  Live
                </span>
              )}
              <button onClick={handleShare}
                className="ml-auto flex items-center gap-1.5 text-[11px] text-white/30 hover:text-white/60 transition-colors">
                {copied ? (
                  <><svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-[#22c55e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>Copied!</>
                ) : (
                  <><svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>Share</>
                )}
              </button>
            </div>

            <div className={`flex gap-4 mb-4 ${round.category === "twitter" ? "items-start" : "items-center"}`}>
              {round.category === "twitter" && round.twitterUsername ? (
                <div className="flex flex-col items-center gap-1.5 shrink-0">
                  <TwitterAvatar username={round.twitterUsername} logoUrl={round.tokenLogo} size={64} />
                  <a
                    href={`https://twitter.com/${round.twitterUsername}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#1d9bf0] text-[11px] font-mono hover:underline"
                  >
                    @{round.twitterUsername}
                  </a>
                </div>
              ) : round.questionType === "token_battle" && round.tokenBattleTokens && round.tokenBattleTokens.length >= 2 ? (
                <div className="flex shrink-0">
                  {(round.tokenBattleTokens as BattleTokenInfo[]).slice(0, 4).map((t, i) => (
                    t.logoUrl
                      ? <img key={t.address} src={t.logoUrl} alt={t.symbol}
                          className="w-10 h-10 rounded-full border-2 border-[#0d0f14] object-cover"
                          style={{ marginLeft: i === 0 ? 0 : -12, zIndex: i }} />
                      : <div key={t.address}
                          className="w-10 h-10 rounded-full border-2 border-[#0d0f14] bg-purple-500/30 flex items-center justify-center text-xs font-bold text-purple-300"
                          style={{ marginLeft: i === 0 ? 0 : -12, zIndex: i }}>{t.symbol[0]}</div>
                  ))}
                </div>
              ) : round.customImage ? (
                <img src={round.customImage} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
              ) : round.targetToken && TOKEN_LOGOS[round.targetToken] ? (
                <img src={TOKEN_LOGOS[round.targetToken]} alt={round.targetToken} className="w-10 h-10 rounded-full shrink-0" />
              ) : null}
              <h1 className="text-xl font-semibold text-white leading-snug pt-1">{round.question}</h1>
            </div>

            {/* Creator + volume row */}
            {(round.creatorUsername || round.totalVolume !== undefined) && (
              <div className="flex flex-wrap items-center gap-4 mb-4 text-sm text-white/60">
                {round.creatorUsername && (
                  <Link href={`/profile/${round.creatorUsername}`} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                    <span className="text-white/40">Created market:</span>
                    {round.creatorAvatarUrl ? (
                      <img src={round.creatorAvatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-white/50">
                        {round.creatorUsername[0].toUpperCase()}
                      </div>
                    )}
                    <span className="text-white font-medium">{round.creatorUsername}</span>
                  </Link>
                )}
                {round.creatorUsername && (
                  <span className="text-white/20">·</span>
                )}
                {(() => {
                  const v = round.totalVolume ?? 0;
                  return (
                    <span>
                      <span className="text-white/40">Vol:</span>{" "}
                      <span className="text-white font-mono font-medium">
                        {v >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(1)}K` : v.toFixed(v === 0 ? 0 : 1)} DORA
                      </span>
                    </span>
                  );
                })()}
                {round.tokenAddress && (
                  <>
                    <span className="text-white/20">·</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(round.tokenAddress!)}
                      title="Copy contract address"
                      className="flex items-center gap-1 font-mono text-xs text-white/40 hover:text-white/80 transition-colors"
                    >
                      {round.tokenAddress.slice(0, 4)}…{round.tokenAddress.slice(-4)}
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                    {round.isPumpFun && (
                      <a
                        href={`https://pump.fun/coin/${round.tokenAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-orange-400/70 hover:text-orange-400 transition-colors"
                      >
                        pump.fun ↗
                      </a>
                    )}
                  </>
                )}
                {round.twitterUrl && (
                  <>
                    <span className="text-white/20">·</span>
                    <a
                      href={round.twitterUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-white/30 hover:text-brand transition-colors"
                    >
                      <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                      /{round.twitterUrl.replace("https://x.com/", "").replace("https://twitter.com/", "")} →
                    </a>
                  </>
                )}
              </div>
            )}

            {/* Countdown timers */}
            {round.status !== "resolved" && (
              <div className="flex flex-wrap items-center gap-5 mb-5 text-sm">
                {!bettingClosed ? (
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-wider text-white/30 mb-0.5">Betting closes in</span>
                    <span className="text-white font-mono font-bold text-lg tabular-nums">{bettingCountdown}</span>
                  </div>
                ) : (
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-wider text-red-400/70 mb-0.5">Betting</span>
                    <span className="text-red-400 font-semibold">Closed</span>
                  </div>
                )}
                <div className="w-px h-8 bg-white/10" />
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-wider text-white/30 mb-0.5">Result in</span>
                  <span className="text-white font-mono font-bold text-lg tabular-nums">{resultCountdown}</span>
                </div>
              </div>
            )}

            {/* Final Results — resolved rounds */}
            {round.status === "resolved" && round.shares && outcomes.length > 0 && (() => {
              const shares = round.shares!;
              const total  = Object.values(shares).reduce((s, v) => s + v, 0);
              return (
                <div className="mb-4 p-4 rounded-xl bg-white/[0.03] border border-white/5">
                  <p className="text-[10px] uppercase tracking-widest text-white/30 mb-3">Final Results</p>
                  <div className="space-y-2">
                    {outcomes.map(o => {
                      const s         = shares[o.id] ?? 0;
                      const pct       = total > 0 ? Math.round(s / total * 100) : 0;
                      const isWinner  = o.id === round.winningOutcome;
                      return (
                        <div key={o.id} className="flex items-center gap-2">
                          <span className={`text-xs font-bold w-4 shrink-0 ${isWinner ? "text-[#22c55e]" : "text-white/40"}`}>
                            {o.id}
                          </span>
                          <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${isWinner ? "bg-[#22c55e]" : "bg-white/15"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className={`text-xs font-mono w-8 text-right shrink-0 ${isWinner ? "text-[#22c55e] font-semibold" : "text-white/40"}`}>
                            {pct}%
                          </span>
                          {isWinner
                            ? <span className="text-[#22c55e] text-xs shrink-0 w-3">✓</span>
                            : <span className="w-3 shrink-0" />
                          }
                          <span className="text-xs text-white/30 break-words min-w-0">{o.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Token stats bar */}
            {hasToken && round.questionType !== "token_battle" && (
              <TokenStats
                targetToken={round.targetToken}
                tokenAddress={round.tokenAddress}
                tokenSymbol={round.tokenSymbol}
              />
            )}

            {/* Token Battle cards */}
            {round.questionType === "token_battle" && round.tokenBattleTokens && round.tokenBattleTokens.length > 0 && (() => {
              const battleTokens = round.tokenBattleTokens as BattleTokenInfo[];
              const tokenLogoMap = Object.fromEntries(
                battleTokens.map(t => [t.outcomeId, { symbol: t.symbol, logoUrl: t.logoUrl }])
              );
              return (
                <>
                  <TokenBattleSection tokens={battleTokens} />
                  <TokenBattleChart tokens={battleTokens} />
                  {outcomes.length > 0 && <PoolBar outcomes={outcomes} prices={lmsrPrices} tokenLogoMap={tokenLogoMap} />}
                </>
              );
            })()}

            {/* Betting probability chart — Twitter rounds */}
            {round.category === "twitter" && outcomes.length > 0 && (
              <div className="mb-4">
                <BettingChart roundId={round.id} outcomes={outcomes as { id: string; label: string }[]} />
                <PoolBar outcomes={outcomes} prices={lmsrPrices} />
              </div>
            )}

            {/* Chart + pool bar */}
            {round.category !== "twitter" && hasToken && outcomes.length > 0 ? (
              <>
                {/* Chart controls: Line/Candles toggle + timeframe dropdown */}
                {(() => {
                  return (
                    <div className="flex items-center justify-between mb-1">
                      {/* Live / Line / Candles toggle */}
                      <div className="flex items-center gap-0.5 rounded-md overflow-hidden border border-white/8"
                           style={{ background: "#0d0f14" }}>
                        {(["live", "line", "candles"] as const).map(ct => (
                          <button
                            key={ct}
                            onClick={() => {
                              setChartType(ct);
                              // Custom tokens: snap to 5m when leaving Live mode with a streaming TF
                              if (isCustomToken && ct !== "live" && ["1s", "5s", "30s"].includes(timeframe)) {
                                setTimeframe("5m");
                              }
                            }}
                            className={`px-2.5 py-1 text-[11px] font-semibold transition-colors
                              ${chartType === ct
                                ? "bg-white/10 text-white"
                                : "text-white/30 hover:text-white/60"}`}
                          >
                            {ct === "live" ? "Live" : ct === "line" ? "Line" : "Candles"}
                          </button>
                        ))}
                      </div>

                      {/* Timeframe dropdown — hidden in Live mode */}
                      {chartType !== "live" && (
                        <div ref={tfRef} className="relative">
                          <button
                            onClick={() => setTfOpen(v => !v)}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold transition-colors"
                            style={{
                              background: "#0d0f14",
                              border: "1px solid rgba(34,197,94,0.35)",
                              color: "#22c55e",
                            }}
                          >
                            {timeframe}
                            <svg className={`w-3 h-3 transition-transform duration-150 ${tfOpen ? "rotate-180" : ""}`}
                                 fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </button>

                          {tfOpen && (
                            <div className="absolute right-0 top-full mt-1 z-30 rounded-lg overflow-hidden py-1"
                                 style={{ background: "#0d0f14", border: "1px solid rgba(255,255,255,0.1)", minWidth: 68 }}>
                              {availableTimeframes.map(tf => (
                                <button
                                  key={tf.key}
                                  onClick={() => {
                                    setTimeframe(tf.key);
                                    setTfOpen(false);
                                  }}
                                  className={`w-full text-left px-3 py-1.5 text-[11px] font-mono transition-colors hover:bg-white/5
                                    ${timeframe === tf.key ? "text-[#22c55e]" : "text-white/45"}`}
                                >
                                  {tf.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                <LiveChart
                  targetToken={round.targetToken}
                  tokenAddress={round.tokenAddress}
                  tokenSymbol={round.tokenSymbol}
                  priceToBeat={round.targetPrice}
                  timeframe={chartType === "live" ? "1s" : timeframe}
                  chartType={chartType}
                  showMcap={round.questionType === "mcap" || round.questionType === "ath_mcap"}
                />
                <PoolBar outcomes={outcomes} prices={lmsrPrices} />
              </>
            ) : round.category !== "twitter" && round.questionType !== "token_battle" ? (
              <div className="flex items-center justify-center rounded-xl"
                   style={{ height: 350, background: "#0d0f14" }}>
                <span className="text-white/20 text-sm">No chart available</span>
              </div>
            ) : null}

            {/* Description */}
            {(round.description || round.twitterUrl) && (
              <div className="mt-4 p-4 rounded-xl bg-white/[0.03] border border-white/5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] uppercase tracking-widest text-white/30">Description</p>
                  {round.twitterUrl && (
                    <a
                      href={round.twitterUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-white/40 hover:text-white transition-colors"
                    >
                      <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                      /{round.twitterUrl.replace("https://x.com/", "").replace("https://twitter.com/", "")} →
                    </a>
                  )}
                </div>
                {round.description && (
                  <p className="text-sm text-white/70 leading-relaxed">{round.description}</p>
                )}
              </div>
            )}

          {/* ── Discussion / Activity tabs ── */}
          <div className="mt-6 bg-white/[0.02] rounded-xl border border-white/5 overflow-hidden">
            <div className="flex border-b border-white/5">
              {(["discussion", "activity"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 px-4 py-3 text-sm font-semibold transition-colors
                    ${activeTab === tab
                      ? "text-white border-b-2 border-brand -mb-px"
                      : "text-white/30 hover:text-white/60"}`}
                >
                  {tab === "discussion" ? "Discussion" : `Activity${recentTrades.length > 0 ? ` (${recentTrades.length})` : ""}`}
                </button>
              ))}
            </div>
            <div className="p-4">
              {activeTab === "discussion" ? (
                <CommentsSection roundId={round.id} />
              ) : (
                <ActivityTab recentTrades={recentTrades} />
              )}
            </div>
          </div>

          {/* Bet panel — mobile/tablet (shown when right column is hidden) */}
          {outcomes.length > 0 && (
            <div className="mt-6 lg:hidden" ref={betPanelRef}>
              <LMSRBetPanel
                roundId={round.id}
                outcomes={outcomes}
                lmsrB={round.lmsrB}
                initialShares={round.shares ?? {}}
                bettingClosed={bettingClosed}
                roundStatus={round.status}
                winningOutcome={round.winningOutcome}
                initialOutcome={initialOutcome}
                onTradeSuccess={refreshRound}
                tokenBattleTokens={round.tokenBattleTokens ?? null}
              />
            </div>
          )}

          {/* Back to Markets */}
          <div className="mt-6 pb-6">
            <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-white/30 hover:text-white/70 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back to Markets
            </Link>
          </div>

        </main>

        {/* Right column: Bet Panel (desktop) */}
        <div className="hidden lg:block w-96 shrink-0 py-6 sticky top-14 self-start">
          {outcomes.length > 0 && (
            <div ref={betPanelRef}>
              <LMSRBetPanel
                roundId={round.id}
                outcomes={outcomes}
                lmsrB={round.lmsrB}
                initialShares={round.shares ?? {}}
                bettingClosed={bettingClosed}
                roundStatus={round.status}
                winningOutcome={round.winningOutcome}
                initialOutcome={initialOutcome}
                onTradeSuccess={refreshRound}
                tokenBattleTokens={round.tokenBattleTokens ?? null}
              />
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
