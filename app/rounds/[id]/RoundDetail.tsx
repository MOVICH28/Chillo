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

// ── Pool distribution bar (LMSR probabilities) ───────────────────────────────

function PoolBar({ outcomes, prices }: { outcomes: Outcome[]; prices: Record<string, number> }) {
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
          const c = OUTCOME_COLORS[o.id];
          return (
            <div key={o.id} className="text-center">
              <div className={`text-[10px] font-bold ${c.text}`}>{o.id}</div>
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
    <div className="min-h-screen bg-base text-white pt-16">
      <div className="max-w-6xl mx-auto px-4 py-6">

        {/* Two-column layout */}
        <div className="flex flex-col lg:flex-row gap-6">

          {/* ── LEFT column (60%) ── */}
          <div className="lg:w-[60%]">

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
                    <a
                      href={`https://solscan.io/token/${round.tokenAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-white/30 hover:text-brand transition-colors"
                    >
                      Solscan ↗
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

            {/* Token stats bar */}
            {hasToken && (
              <TokenStats
                targetToken={round.targetToken}
                tokenAddress={round.tokenAddress}
                tokenSymbol={round.tokenSymbol}
              />
            )}

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
            ) : round.category !== "twitter" ? (
              <div className="flex items-center justify-center rounded-xl"
                   style={{ height: 350, background: "#0d0f14" }}>
                <span className="text-white/20 text-sm">No chart available</span>
              </div>
            ) : null}

          </div>

          {/* ── RIGHT column (40%) ── */}
          <div className="lg:w-[40%] flex flex-col gap-4">
            {/* LMSR Bet Panel */}
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
                />
              </div>
            )}
          </div>
        </div>

        {/* ── Discussion / Activity tabs (full width) ── */}
        <div className="mt-6 bg-white/[0.02] rounded-xl border border-white/5 overflow-hidden">
          {/* Tab switcher */}
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

        {/* Back to Markets */}
        <div className="mt-6 pb-2">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-white/30 hover:text-white/70 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Markets
          </Link>
        </div>

      </div>
    </div>
  );
}
