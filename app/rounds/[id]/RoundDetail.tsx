"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import LMSRBetPanel from "@/components/LMSRBetPanel";
import {
  LineChart, Line, XAxis, YAxis, ReferenceArea, ReferenceLine,
  ResponsiveContainer, Tooltip,
} from "recharts";
import { Outcome } from "@/lib/types";
import { useBinancePrice } from "@/lib/useBinancePrice";
import { useAuth } from "@/lib/useAuth";

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
  roundNumber: number | null;
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

// ── Live chart ────────────────────────────────────────────────────────────────

function LiveChart({ token, priceToBeat }: { token: "bitcoin" | "solana"; priceToBeat: number | null }) {
  const { price, history, status } = useBinancePrice(token);

  const fmtY = token === "bitcoin"
    ? (v: number) => `$${Math.round(v).toLocaleString("en-US")}`
    : (v: number) => `$${v.toFixed(2)}`;

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
  const isAbove = priceToBeat !== null ? currentPrice >= priceToBeat : true;
  const lineColor = priceToBeat !== null ? (isAbove ? "#22c55e" : "#ef4444") : "#22c55e";

  const allPrices = [...history.map(p => p.price), ...(priceToBeat ? [priceToBeat] : [])];
  const rawMin = Math.min(...allPrices);
  const rawMax = Math.max(...allPrices);
  const pad = Math.max((rawMax - rawMin) * 0.18, token === "bitcoin" ? 100 : 0.2);
  const domainMin = rawMin - pad;
  const domainMax = rawMax + pad;

  const t0 = history[0].time;
  const fmtX = (t: number) => {
    const elapsed = Math.round((t - t0) / 1000);
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const data = history.map(p => ({ t: p.time, price: p.price }));

  return (
    <div className="h-[400px] w-full select-none bg-surface-2 rounded-xl border border-white/5 overflow-hidden">
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-0">
        <span className={`w-1.5 h-1.5 rounded-full ${status === "live" ? "bg-[#22c55e]" : "bg-white/20"}`} />
        <span className="text-[10px] uppercase tracking-widest font-bold text-white/40">
          {token === "bitcoin" ? "BTC/USDT" : "SOL/USDT"}
        </span>
        <span className="ml-auto text-xs font-mono font-semibold text-white/80">{fmtY(currentPrice)}</span>
      </div>
      <ResponsiveContainer width="100%" height="90%">
        <LineChart data={data} margin={{ top: 8, right: 72, left: 0, bottom: 8 }}>
          {priceToBeat !== null && (
            <>
              <ReferenceArea y1={priceToBeat} y2={domainMax} fill="rgba(34,197,94,0.05)" strokeOpacity={0} />
              <ReferenceArea y1={domainMin} y2={priceToBeat} fill="rgba(239,68,68,0.05)" strokeOpacity={0} />
            </>
          )}
          {priceToBeat !== null && (
            <ReferenceLine y={priceToBeat} stroke="#4b5563" strokeDasharray="6 3" strokeWidth={1}
              label={{ value: `Start ${fmtY(priceToBeat)}`, position: "insideTopLeft", fill: "#6b7280", fontSize: 9, dy: -4 }} />
          )}
          <ReferenceLine y={currentPrice} stroke={lineColor} strokeWidth={1} strokeOpacity={0.6} strokeDasharray="3 3"
            label={{ value: fmtY(currentPrice), position: "right", fill: lineColor, fontSize: 11, fontWeight: 700, dx: 6 }} />
          <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={fmtX}
            tick={{ fontSize: 9, fill: "#374151" }} axisLine={{ stroke: "#1f2937" }} tickLine={false}
            interval="preserveStartEnd" tickCount={6} />
          <YAxis domain={[domainMin, domainMax]} tickFormatter={fmtY} width={token === "bitcoin" ? 72 : 58}
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

// ── Pool distribution bar ─────────────────────────────────────────────────────

function PoolBar({ outcomes, totalPool }: { outcomes: Outcome[]; totalPool: number }) {
  if (totalPool <= 0) {
    return (
      <div className="mt-3 rounded-xl border border-white/5 bg-white/[0.02] p-4">
        <p className="text-xs text-white/30 text-center">No bets placed yet</p>
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-xl border border-white/5 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-white/30 uppercase tracking-wider">Pool Distribution</span>
        <span className="text-xs font-mono text-white/50">{totalPool.toFixed(2)} DORA total</span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden gap-px">
        {outcomes.map(o => {
          const pct = (o.pool / totalPool) * 100;
          if (pct < 0.1) return null;
          return <div key={o.id} className={OUTCOME_COLORS[o.id].dot} style={{ width: `${pct}%` }} title={`${o.id}: ${pct.toFixed(1)}%`} />;
        })}
      </div>
      <div className="flex justify-between mt-2">
        {outcomes.map(o => {
          const pct = (o.pool / totalPool) * 100;
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

// ── Recent Trades panel (collapsible) ────────────────────────────────────────

function RecentBetsPanel({ recentTrades }: { round: RoundData; recentTrades: RecentTrade[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3 bg-white/[0.02] rounded-xl border border-white/5 overflow-hidden">
      {/* Collapsible header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        <span className="text-sm font-semibold text-white">
          Recent Trades
          {recentTrades.length > 0 && (
            <span className="text-white/20 font-normal text-xs ml-2">{recentTrades.length}</span>
          )}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`w-4 h-4 text-white/30 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-white/5 px-4 pb-3">
          {recentTrades.length === 0 ? (
            <p className="text-white/20 text-xs text-center py-4">No trades yet — be the first!</p>
          ) : (
            <div className="divide-y divide-white/5 max-h-[300px] overflow-y-auto">
              {recentTrades.map(trade => {
                const c = OUTCOME_COLORS[trade.outcome] ?? { text: "text-white/30", bg: "bg-white/5", border: "border-white/10", dot: "bg-white/20", hex: "#fff" };
                const isBuy   = trade.type === "buy";
                const doraAmt = isBuy ? trade.totalCost : -trade.totalCost;

                return (
                  <div key={trade.id} className="flex items-center gap-2 py-1.5 text-xs">
                    {/* Avatar + username */}
                    {trade.username ? (
                      <Link href={`/profile/${trade.username}`} className="flex items-center gap-1.5 shrink-0 group min-w-0">
                        <Avatar username={trade.username} avatarUrl={trade.avatarUrl} size={18} />
                        <span className="text-white/50 font-mono truncate max-w-[64px] group-hover:text-[#22c55e] transition-colors">
                          {trade.username}
                        </span>
                      </Link>
                    ) : (
                      <span className="text-white/20 font-mono shrink-0">anon</span>
                    )}

                    {/* BUY / SELL */}
                    <span className={`px-1 py-px rounded text-[10px] font-bold shrink-0
                      ${isBuy ? "bg-[#22c55e]/15 text-[#22c55e]" : "bg-red-500/15 text-red-400"}`}>
                      {isBuy ? "BUY" : "SELL"}
                    </span>

                    {/* Outcome */}
                    <span className={`px-1.5 py-px rounded text-[10px] font-bold border shrink-0 ${c.bg} ${c.text} ${c.border}`}>
                      {trade.outcome}
                    </span>

                    <span className="flex-1" />

                    {/* Amount */}
                    <span className="font-mono text-white/80 shrink-0">{doraAmt.toFixed(1)} D</span>

                    {/* Time */}
                    <span className="text-white/20 shrink-0 w-10 text-right">{timeAgo(trade.createdAt)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
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
    <div className="mt-6 bg-white/[0.02] rounded-xl border border-white/5 p-4">
      <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
        Discussion
        {comments.length > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-white/10 text-white/40 text-[10px] font-mono">{comments.length}</span>
        )}
      </h2>

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
  const [round, setRound]               = useState<RoundData>(initialRound);
  const [recentTrades, setRecentTrades] = useState<RecentTrade[]>([]);
  const [copied, setCopied]         = useState(false);

  const resultCountdown  = useCountdown(round.endsAt);
  const bettingCountdown = useCountdown(round.bettingClosesAt ?? round.endsAt);

  const outcomes      = round.outcomes ?? [];
  const totalPool     = round.realPool ?? 0;
  const bettingClosed = round.bettingClosesAt
    ? new Date() > new Date(round.bettingClosesAt)
    : round.status !== "open";

  const hasToken = round.targetToken === "bitcoin" || round.targetToken === "solana";
  const token: "bitcoin" | "solana" = round.targetToken === "solana" ? "solana" : "bitcoin";

  const refreshRound = useCallback(async () => {
    try {
      const res  = await fetch(`/api/rounds/${round.id}`);
      if (!res.ok) return;
      const data = await res.json();
      setRound(data);
      setRecentTrades(data.recentTrades ?? []);
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

            <h1 className="text-xl font-semibold text-white leading-snug mb-4">{round.question}</h1>

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

            {/* Chart + pool bar */}
            {hasToken && outcomes.length > 0 ? (
              <>
                <LiveChart token={token} priceToBeat={round.targetPrice} />
                <PoolBar outcomes={outcomes} totalPool={totalPool} />
              </>
            ) : (
              <div className="h-[400px] flex items-center justify-center bg-surface-2 rounded-xl border border-white/5">
                <span className="text-white/20 text-sm">No chart available</span>
              </div>
            )}

            {/* Recent Trades — collapsible */}
            <RecentBetsPanel round={round} recentTrades={recentTrades} />
          </div>

          {/* ── RIGHT column (40%) ── */}
          <div className="lg:w-[40%] flex flex-col gap-4">
            {/* LMSR Bet Panel */}
            {outcomes.length > 0 && (
              <LMSRBetPanel
                roundId={round.id}
                outcomes={outcomes}
                lmsrB={round.lmsrB}
                initialShares={round.shares ?? {}}
                bettingClosed={bettingClosed}
                roundStatus={round.status}
                winningOutcome={round.winningOutcome}
                onTradeSuccess={refreshRound}
              />
            )}
          </div>
        </div>

        {/* ── Round Rules (full width) ── */}
        <div className="mt-6 bg-white/[0.02] rounded-xl border border-white/5 p-4">
          <h2 className="text-sm font-semibold text-white mb-3">Round Rules</h2>
          <ul className="space-y-2">
            {[
              "Trading closes 5 minutes before the result",
              "Buy shares in any outcome — prices update automatically via LMSR",
              "Each winning share pays out exactly 1 DORA at resolution",
              "Platform fee: 1% on every trade",
              "Sell your shares any time before trading closes",
              "Results determined by real-time price data at round end",
            ].map((rule, i) => (
              <li key={i} className="flex items-start gap-2.5 text-xs text-white/50">
                <span className="text-[#22c55e] font-mono shrink-0 mt-0.5">{i + 1}.</span>
                {rule}
              </li>
            ))}
          </ul>
        </div>

        {/* ── Comments (full width) ── */}
        <CommentsSection roundId={round.id} />

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
