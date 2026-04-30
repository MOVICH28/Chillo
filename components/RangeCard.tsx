"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Round, Outcome } from "@/lib/types";
import { LiveData } from "@/lib/useLiveData";

interface RangeCardProps {
  round: Round;
  onBet?: (round: Round, outcomeId: string, outcome: Outcome) => void;
  liveData?: LiveData;
}

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
      return { price: p, mcap: m, history: [...prev.history, p].slice(-50) };
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

// ── Token Battle leaderboard hook ─────────────────────────────────────────────

type BattleEntry = {
  address: string; symbol: string; name: string;
  logoUrl: string | null; outcomeId: string; mcap: number;
};

function useBattleLeaderboard(tokens: BattleEntry[] | null | undefined): BattleEntry[] {
  const [mcaps, setMcaps] = useState<Record<string, number>>(() =>
    Object.fromEntries((tokens ?? []).map(t => [t.address, t.mcap]))
  );

  useEffect(() => {
    if (!tokens || tokens.length === 0) return;
    let cancelled = false;
    async function pollAll() {
      await Promise.all(tokens!.map(async t => {
        try {
          const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${t.address}`, { cache: "no-store" });
          if (!res.ok || cancelled) return;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data = await res.json() as { pairs?: any[] };
          const pairs = (data.pairs ?? []).sort((a: any, b: any) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0));
          const m = pairs[0]?.marketCap ?? pairs[0]?.fdv ?? 0;
          if (m > 0 && !cancelled) setMcaps(prev => ({ ...prev, [t.address]: m }));
        } catch { /**/ }
      }));
    }
    pollAll();
    const id = setInterval(pollAll, 10_000);
    return () => { cancelled = true; clearInterval(id); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [...(tokens ?? [])]
    .map(t => ({ ...t, mcap: mcaps[t.address] ?? t.mcap }))
    .sort((a, b) => b.mcap - a.mcap);
}

function fmtMcapCard(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return v > 0 ? `$${v.toFixed(0)}` : "—";
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
          <div className="flex items-center gap-1.5 flex-wrap">
            {round.roundNumber != null && (
              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-mono text-muted bg-surface-3 border border-surface-3/60">
                #{round.roundNumber}
              </span>
            )}
            {round.twitterUsername ? (
              <span className="inline-flex px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border bg-[#1d9bf0]/10 text-[#1d9bf0] border-[#1d9bf0]/20">
                Twitter
              </span>
            ) : (
              <span className="inline-flex px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
                Crypto
              </span>
            )}
            {round.isPumpFun && (
              <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold border bg-gradient-to-r from-orange-500/10 to-green-500/10 text-orange-400 border-orange-500/20">
                pump.fun
              </span>
            )}
            {round.questionType === "token_battle" && (
              <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold border bg-purple-500/10 text-purple-400 border-purple-500/20">
                ⚔️ Token Battle
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
          {round.questionType === "token_battle" && round.tokenBattleTokens && round.tokenBattleTokens.length >= 2 ? (
            <div className="flex shrink-0" style={{ width: 36 + (round.tokenBattleTokens.length - 1) * 14 }}>
              {round.tokenBattleTokens.slice(0, 4).map((t, i) => (
                t.logoUrl
                  ? <img key={t.address} src={t.logoUrl} alt={t.symbol} className="w-8 h-8 rounded-full border-2 border-surface object-cover" style={{ marginLeft: i === 0 ? 0 : -14, zIndex: i }} />
                  : <div key={t.address} className="w-8 h-8 rounded-full border-2 border-surface bg-purple-500/30 flex items-center justify-center text-[9px] font-bold text-purple-300" style={{ marginLeft: i === 0 ? 0 : -14, zIndex: i }}>{t.symbol[0]}</div>
              ))}
            </div>
          ) : round.twitterUsername && round.tokenLogo ? (
            <div className="flex flex-col items-center gap-0.5 shrink-0">
              <TwitterCardAvatar username={round.twitterUsername} logoUrl={round.tokenLogo} />
              <span className="text-[9px] text-[#1d9bf0] font-mono leading-none">@{round.twitterUsername}</span>
            </div>
          ) : round.customImage ? (
            <img src={round.customImage} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
          ) : round.targetToken && TOKEN_LOGOS[round.targetToken] ? (
            <img src={TOKEN_LOGOS[round.targetToken]} alt={round.targetToken} className="w-8 h-8 rounded-full shrink-0" />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="text-white/80 text-base font-semibold truncate whitespace-nowrap overflow-hidden" title={round.question}>{round.question}</p>
          </div>
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

        {(round.totalPool ?? 0) > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-y-0.5 text-[10px] font-mono">
            {outcomes.flatMap((o, idx) => {
              const pct = Math.round(((o.pool ?? 0) / (round.totalPool ?? 1)) * 100);
              const isWinner = o.id === round.winningOutcome;
              const items = [];
              if (idx > 0) items.push(
                <span key={`sep-${o.id}`} className="text-white/20 mx-1">·</span>
              );
              items.push(
                <span key={o.id} className={isWinner ? "text-[#22c55e] font-bold" : "text-white/30"}>
                  {o.id} {pct}%{isWinner ? " ✓" : ""}
                </span>
              );
              return items;
            })}
          </div>
        )}

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

  // Live mcaps for token_battle outcome buttons
  const battleEntries = (round.questionType === "token_battle" && round.tokenBattleTokens)
    ? (round.tokenBattleTokens as any[]).map((t: any) => ({ ...t, mcap: t.currentMcap ?? 0 })) as BattleEntry[]
    : null;
  const rankedBattle   = useBattleLeaderboard(battleEntries);
  const battleMcapMap  = Object.fromEntries(rankedBattle.map(t => [t.outcomeId, t.mcap]));

  const hasChart   = round.targetToken === "bitcoin" || round.targetToken === "solana";
  const isMcapQ    = round.questionType === "mcap" || round.questionType === "ath_mcap";
  const isCrypto   = !round.twitterUsername && (
    round.category === "crypto" ||
    round.category === "custom" ||
    !!round.targetToken ||
    !!round.tokenAddress ||
    !!round.tokenSymbol
  );
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
  const hasTokenData  = !!(round.targetToken || round.tokenAddress);
  const displayValue  = isMcapQ && liveStats.mcap != null ? liveStats.mcap : liveStats.price;
  const changeVal     = liveStats.history.length >= 2
    ? (liveStats.history[liveStats.history.length - 1] - liveStats.history[0]) / liveStats.history[0] * 100
    : null;
  const showInfoBox   = isCrypto && hasTokenData;

  // Footer values
  const totalVolume = round.totalVolume ?? 0;
  const fmtPool   = totalVolume >= 1_000_000
    ? `${(totalVolume / 1_000_000).toFixed(2)}M`
    : totalVolume >= 1_000
    ? `${(totalVolume / 1_000).toFixed(1)}K`
    : totalVolume.toFixed(totalVolume === 0 ? 0 : 1);

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
            {round.twitterUsername ? (
              <span className="inline-flex px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border bg-[#1d9bf0]/10 text-[#1d9bf0] border-[#1d9bf0]/20">
                Twitter
              </span>
            ) : (
              <span className="inline-flex px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
                Crypto
              </span>
            )}
            {round.isPumpFun && (
              <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold border bg-gradient-to-r from-orange-500/10 to-green-500/10 text-orange-400 border-orange-500/20">
                pump.fun
              </span>
            )}
            {round.questionType === "token_battle" && (
              <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold border bg-purple-500/10 text-purple-400 border-purple-500/20">
                ⚔️ Token Battle
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
        <div className="flex items-center gap-2.5 mb-2.5 min-w-0 overflow-hidden">
          {round.questionType === "token_battle" && round.tokenBattleTokens && round.tokenBattleTokens.length >= 2 ? (
            <div className="flex shrink-0" style={{ width: 36 + (round.tokenBattleTokens.length - 1) * 14 }}>
              {round.tokenBattleTokens.slice(0, 4).map((t, i) => (
                t.logoUrl
                  ? <img key={t.address} src={t.logoUrl} alt={t.symbol} className="w-8 h-8 rounded-full border-2 border-surface object-cover" style={{ marginLeft: i === 0 ? 0 : -14, zIndex: i }} />
                  : <div key={t.address} className="w-8 h-8 rounded-full border-2 border-surface bg-purple-500/30 flex items-center justify-center text-[9px] font-bold text-purple-300" style={{ marginLeft: i === 0 ? 0 : -14, zIndex: i }}>{t.symbol[0]}</div>
              ))}
            </div>
          ) : round.twitterUsername && round.tokenLogo ? (
            <div className="flex flex-col items-center gap-0.5 shrink-0">
              <TwitterCardAvatar username={round.twitterUsername} logoUrl={round.tokenLogo} />
              <span className="text-[9px] text-[#1d9bf0] font-mono leading-none">@{round.twitterUsername}</span>
            </div>
          ) : round.customImage ? (
            <img src={round.customImage} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
          ) : round.targetToken && TOKEN_LOGOS[round.targetToken] ? (
            <img src={TOKEN_LOGOS[round.targetToken]} alt={round.targetToken} className="w-8 h-8 rounded-full shrink-0" />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="text-white text-base font-semibold truncate whitespace-nowrap overflow-hidden" title={round.question}>{round.question}</p>
          </div>
        </div>

        {/* Price / mcap info box — all crypto rounds with token data */}
        {showInfoBox && (
          <div className="flex items-center justify-between px-2 py-1 bg-white/[0.03] rounded-lg mb-2 border border-white/5">
            <div>
              <div className="text-[8px] text-white/25 uppercase tracking-wider mb-0.5">
                {isMcapQ ? "Mkt Cap" : "Price"}
              </div>
              <div className="text-base font-mono font-bold text-white leading-tight">
                {displayValue != null && displayValue > 0
                  ? isMcapQ && liveStats.mcap != null
                    ? fmtMcap(liveStats.mcap)
                    : fmtPrice(liveStats.price!)
                  : <span className="text-white/20">—</span>}
              </div>
              {changeVal != null && (
                <div className={`text-[9px] font-mono ${changeVal >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {changeVal >= 0 ? "+" : ""}{changeVal.toFixed(2)}%
                </div>
              )}
            </div>
            <MiniSparkline data={liveStats.history} width={120} height={28} />
          </div>
        )}

        {/* Outcome grid — compact */}
        <div className="grid grid-cols-2 gap-1 mb-1.5">
          {outcomes.map((o) => {
            const c   = OUTCOME_COLORS[o.id];
            const pct = prices[o.id] != null ? (prices[o.id] * 100).toFixed(1) : null;
            const battleToken = round.questionType === "token_battle"
              ? round.tokenBattleTokens?.find(t => t.outcomeId === o.id)
              : undefined;
            const battleMcap = battleToken ? (battleMcapMap[o.id] ?? 0) : 0;
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
                <div className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden">
                  {battleToken ? (
                    <>
                      {battleToken.logoUrl
                        ? <img src={battleToken.logoUrl} alt={battleToken.symbol} className="w-4 h-4 rounded-full shrink-0 object-cover" />
                        : <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0 ${c.bg} ${c.text}`}>{battleToken.symbol[0]}</div>}
                      <span className={`text-[11px] font-bold leading-tight truncate ${c.text}`}>${battleToken.symbol}</span>
                    </>
                  ) : (
                    <>
                      <span className={`w-4 h-4 text-[9px] font-bold flex items-center justify-center rounded shrink-0 ${c.bg} ${c.text} border ${c.border}`}>
                        {o.id}
                      </span>
                      <span className="text-[11px] font-medium text-white/80 leading-tight truncate">{o.label}</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {battleToken && battleMcap > 0 && (
                    <span className="text-[9px] font-mono text-white/40">{fmtMcapCard(battleMcap)}</span>
                  )}
                  {pct !== null
                    ? <span className={`text-[10px] font-mono font-bold ${c.text}`}>{pct}%</span>
                    : <span className="text-[10px] text-muted font-mono">—</span>}
                </div>
              </button>
            );
          })}
        </div>

      </div>

      {/* Footer */}
      <div className="px-4 pb-3 border-t border-white/5 pt-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-white font-mono">
            Vol: {fmtPool} DORA
          </span>
          <div className="flex items-center gap-2 shrink-0">
            {hasChart && (
              <span className="flex items-center gap-1 text-[10px] text-brand">
                Chart
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </span>
            )}
            {round.creatorUsername && (
              <Link
                href={`/profile/${round.creatorUsername}`}
                onClick={e => e.stopPropagation()}
                className="flex items-center gap-1 text-xs hover:opacity-80 transition-opacity"
              >
                <span className="text-white/40 mr-1">Created market:</span>
                {round.creatorAvatarUrl ? (
                  <img src={round.creatorAvatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[9px] font-bold text-white/50">
                    {round.creatorUsername[0].toUpperCase()}
                  </div>
                )}
                <span className="text-white font-medium ml-1">{round.creatorUsername}</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
