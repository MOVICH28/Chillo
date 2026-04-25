"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import LMSRBetPanel from "@/components/LMSRBetPanel";
import { getAllPrices } from "@/lib/lmsr";
import {
  ComposedChart, LineChart, Line, Bar,
  XAxis, YAxis, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip,
} from "recharts";
import { Outcome } from "@/lib/types";
import { useTokenPrice, Timeframe } from "@/lib/useTokenPrice";
import { useAuth } from "@/lib/useAuth";
import TokenStats from "@/components/TokenStats";

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
  tokenAddress: string | null;
  tokenSymbol:  string | null;
  tokenLogo:    string | null;
  isCustom:     boolean;
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

function LiveChart({ targetToken, tokenAddress, tokenSymbol, priceToBeat, timeframe }: {
  targetToken?:  string | null;
  tokenAddress?: string | null;
  tokenSymbol?:  string | null;
  priceToBeat:   number | null;
  timeframe:     Timeframe;
}) {
  const { price, history, status, label, isKline } = useTokenPrice({
    targetToken, tokenAddress, tokenSymbol, timeframe,
  });

  const isBtc = label.startsWith("BTC");
  const fmtY = (v: number) => {
    if (v >= 1000) return `$${Math.round(v).toLocaleString("en-US")}`;
    if (v >= 1)    return `$${v.toFixed(isBtc ? 2 : 4)}`;
    if (v >= 0.01) return `$${v.toFixed(6)}`;
    return `$${v.toFixed(8)}`;
  };

  if (history.length < 2) {
    return (
      <div className="h-[400px] flex flex-col items-center justify-center gap-3 bg-surface-2 rounded-xl border border-white/5">
        <svg className="animate-spin w-5 h-5 text-white/20" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        <span className="text-xs text-white/30">
          {status === "connecting" ? "Connecting…" : "Waiting for price data…"}
        </span>
      </div>
    );
  }

  const currentPrice = price ?? history[history.length - 1].price;
  const isAbove   = priceToBeat !== null ? currentPrice >= priceToBeat : true;
  const lineColor = priceToBeat !== null ? (isAbove ? "#22c55e" : "#ef4444") : "#22c55e";

  const allPrices = [...history.map(p => p.price), ...(priceToBeat != null ? [priceToBeat] : [])];
  const rawMin  = Math.min(...allPrices);
  const rawMax  = Math.max(...allPrices);
  const rawSpan = rawMax - rawMin;
  const pad     = Math.max(rawSpan * 0.18, rawMax * 0.001, 0.000001);
  const domainMin = rawMin - pad;
  const domainMax = rawMax + pad;

  // X-axis label: elapsed time for streaming, human time for klines
  const t0   = history[0].time;
  const fmtX = isKline
    ? (t: number) => {
        const d = new Date(t);
        if (timeframe === "1m" || timeframe === "5m" || timeframe === "15m" || timeframe === "30m")
          return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
      }
    : (t: number) => {
        const elapsed = Math.round((t - t0) / 1000);
        const m = Math.floor(elapsed / 60);
        const s = elapsed % 60;
        return `${m}:${String(s).padStart(2, "0")}`;
      };

  const data   = history.map(p => ({ t: p.time, price: p.price, volume: p.volume ?? 0 }));
  const yWidth = isBtc ? 72 : 64;

  // Kline view: ComposedChart with price line + volume bars
  if (isKline) {
    const maxVol = Math.max(...data.map(d => d.volume), 1);
    return (
      <div className="w-full select-none bg-surface-2 rounded-xl border border-white/5 overflow-hidden">
        <div className="flex items-center gap-1.5 px-4 pt-3 pb-0">
          <span className={`w-1.5 h-1.5 rounded-full ${status === "live" ? "bg-[#22c55e]" : "bg-white/20"}`} />
          <span className="text-[10px] uppercase tracking-widest font-bold text-white/40">{label}</span>
          <span className="ml-auto text-xs font-mono font-semibold text-white/80">{fmtY(currentPrice)}</span>
        </div>
        {/* Price chart: 75% height */}
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: yWidth, left: 0, bottom: 0 }}>
              {priceToBeat != null && (
                <>
                  <ReferenceArea y1={priceToBeat} y2={domainMax} fill="rgba(34,197,94,0.05)" strokeOpacity={0} />
                  <ReferenceArea y1={domainMin} y2={priceToBeat} fill="rgba(239,68,68,0.05)" strokeOpacity={0} />
                </>
              )}
              {priceToBeat != null && (
                <ReferenceLine y={priceToBeat} stroke="#4b5563" strokeDasharray="6 3" strokeWidth={1}
                  label={{ value: `Start ${fmtY(priceToBeat)}`, position: "insideTopLeft", fill: "#6b7280", fontSize: 9, dy: -4 }} />
              )}
              <ReferenceLine y={currentPrice} stroke={lineColor} strokeWidth={1} strokeOpacity={0.6} strokeDasharray="3 3"
                label={{ value: fmtY(currentPrice), position: "right", fill: lineColor, fontSize: 11, fontWeight: 700, dx: 6 }} />
              <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={fmtX}
                tick={{ fontSize: 9, fill: "#374151" }} axisLine={{ stroke: "#1f2937" }} tickLine={false}
                interval="preserveStartEnd" tickCount={6} hide />
              <YAxis domain={[domainMin, domainMax]} tickFormatter={fmtY} width={yWidth}
                tick={{ fontSize: 9, fill: "#374151" }} axisLine={false} tickLine={false} tickCount={5} />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(v: any, name: any) => name === "price" ? [fmtY(v as number), "Price"] : null}
                labelFormatter={(t) => fmtX(t as number)}
                contentStyle={{ background: "#0f0f1a", border: "1px solid #1f2937", borderRadius: 6, fontSize: 11, padding: "4px 10px" }}
                itemStyle={{ color: lineColor }}
                cursor={{ stroke: "#1f2937", strokeWidth: 1 }}
              />
              <Line type="linear" dataKey="price" stroke={lineColor} strokeWidth={2} dot={false}
                activeDot={{ r: 3, fill: lineColor, stroke: "#0f0f1a", strokeWidth: 2 }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {/* Volume bars: 25% height */}
        <div style={{ height: 80 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 0, right: yWidth, left: 0, bottom: 8 }}>
              <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={fmtX}
                tick={{ fontSize: 9, fill: "#374151" }} axisLine={{ stroke: "#1f2937" }} tickLine={false}
                interval="preserveStartEnd" tickCount={6} />
              <YAxis domain={[0, maxVol * 1.1]} width={yWidth} tick={false} axisLine={false} tickLine={false} />
              <Bar dataKey="volume" fill="rgba(255,255,255,0.12)" isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // Streaming view: simple LineChart
  return (
    <div className="h-[400px] w-full select-none bg-surface-2 rounded-xl border border-white/5 overflow-hidden">
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-0">
        <span className={`w-1.5 h-1.5 rounded-full ${status === "live" ? "bg-[#22c55e]" : "bg-white/20"}`} />
        <span className="text-[10px] uppercase tracking-widest font-bold text-white/40">{label}</span>
        <span className="ml-auto text-xs font-mono font-semibold text-white/80">{fmtY(currentPrice)}</span>
      </div>
      <ResponsiveContainer width="100%" height="90%">
        <LineChart data={data} margin={{ top: 8, right: yWidth, left: 0, bottom: 8 }}>
          {priceToBeat != null && (
            <>
              <ReferenceArea y1={priceToBeat} y2={domainMax} fill="rgba(34,197,94,0.05)" strokeOpacity={0} />
              <ReferenceArea y1={domainMin} y2={priceToBeat} fill="rgba(239,68,68,0.05)" strokeOpacity={0} />
            </>
          )}
          {priceToBeat != null && (
            <ReferenceLine y={priceToBeat} stroke="#4b5563" strokeDasharray="6 3" strokeWidth={1}
              label={{ value: `Start ${fmtY(priceToBeat)}`, position: "insideTopLeft", fill: "#6b7280", fontSize: 9, dy: -4 }} />
          )}
          <ReferenceLine y={currentPrice} stroke={lineColor} strokeWidth={1} strokeOpacity={0.6} strokeDasharray="3 3"
            label={{ value: fmtY(currentPrice), position: "right", fill: lineColor, fontSize: 11, fontWeight: 700, dx: 6 }} />
          <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={fmtX}
            tick={{ fontSize: 9, fill: "#374151" }} axisLine={{ stroke: "#1f2937" }} tickLine={false}
            interval="preserveStartEnd" tickCount={6} />
          <YAxis domain={[domainMin, domainMax]} tickFormatter={fmtY} width={yWidth}
            tick={{ fontSize: 9, fill: "#374151" }} axisLine={false} tickLine={false} tickCount={6} />
          <Tooltip
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(v: any) => [fmtY(v as number), "Price"]}
            labelFormatter={(t) => fmtX(t as number)}
            contentStyle={{ background: "#0f0f1a", border: "1px solid #1f2937", borderRadius: 6, fontSize: 11, padding: "4px 10px" }}
            itemStyle={{ color: lineColor }}
            cursor={{ stroke: "#1f2937", strokeWidth: 1 }}
          />
          <Line type="linear" dataKey="price" stroke={lineColor} strokeWidth={2} dot={false}
            activeDot={{ r: 3, fill: lineColor, stroke: "#0f0f1a", strokeWidth: 2 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
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

  const hasToken = !!(round.targetToken || round.tokenAddress || round.tokenSymbol);

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

            <div className="flex items-center gap-3 mb-4">
              {round.targetToken && TOKEN_LOGOS[round.targetToken] && (
                <img src={TOKEN_LOGOS[round.targetToken]} alt={round.targetToken} className="w-10 h-10 rounded-full shrink-0" />
              )}
              <h1 className="text-xl font-semibold text-white leading-snug">{round.question}</h1>
            </div>

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

            {/* Chart + pool bar */}
            {hasToken && outcomes.length > 0 ? (
              <>
                {/* Timeframe selector */}
                <div className="flex items-center gap-1 flex-wrap mb-2">
                  {TIMEFRAMES.map(tf => (
                    <button
                      key={tf.key}
                      onClick={() => setTimeframe(tf.key)}
                      className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold transition-colors
                        ${timeframe === tf.key
                          ? "bg-brand/20 text-brand border border-brand/40"
                          : "text-white/30 hover:text-white/60 border border-transparent"}`}
                    >
                      {tf.label}
                    </button>
                  ))}
                </div>
                <LiveChart
                  targetToken={round.targetToken}
                  tokenAddress={round.tokenAddress}
                  tokenSymbol={round.tokenSymbol}
                  priceToBeat={round.targetPrice}
                  timeframe={timeframe}
                />
                <PoolBar outcomes={outcomes} prices={lmsrPrices} />
              </>
            ) : (
              <div className="h-[400px] flex items-center justify-center bg-surface-2 rounded-xl border border-white/5">
                <span className="text-white/20 text-sm">No chart available</span>
              </div>
            )}

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
