"use client";

export const dynamic = "force-dynamic";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";
import Navbar from "@/components/Navbar";
import AuthModal from "@/components/AuthModal";
import Avatar from "@/components/Avatar";

import {
  PieChart, Pie, Cell,
  ComposedChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

interface BetWithRound {
  id: string;
  roundId: string;
  walletAddress: string;
  side: string;
  amount: number;
  odds: number;
  txHash: string;
  createdAt: string;
  result: string | null;
  payout: number | null;
  paid: boolean;
  currency: string;
  round: { question: string; status: string; winningOutcome: string | null; outcomes: { id: string; label: string }[] | null } | null;
}


const OUTCOME_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  A: { text: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/30" },
  B: { text: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30" },
  C: { text: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30" },
  D: { text: "text-green-400",  bg: "bg-green-500/10",  border: "border-green-500/30" },
  E: { text: "text-sky-400",    bg: "bg-sky-500/10",    border: "border-sky-500/30" },
  F: { text: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/30" },
};

function resultLabel(bet: BetWithRound): { label: string; color: string } {
  if (bet.result === "refund") return { label: "REFUND", color: "text-gray-400" };
  if (bet.result === null) return { label: "Pending", color: "text-yellow-400" };
  return bet.result === bet.side
    ? { label: "WIN", color: "text-yes" }
    : { label: "LOSS", color: "text-no" };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PieTooltip({ active, payload, bets }: any) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const name: string  = entry.name;
  const count: number = entry.value;
  const winAmt    = bets.filter((b: BetWithRound) => b.result !== "refund" && b.result === b.side && b.result !== null)
    .reduce((s: number, b: BetWithRound) => s + ((b.payout ?? 0) - b.amount), 0);
  const lossAmt   = bets.filter((b: BetWithRound) => b.result !== null && b.result !== "refund" && b.result !== b.side)
    .reduce((s: number, b: BetWithRound) => s + b.amount, 0);
  const refundAmt = bets.filter((b: BetWithRound) => b.result === "refund")
    .reduce((s: number, b: BetWithRound) => s + b.amount, 0);
  const amt = name === "Wins" ? winAmt : name === "Losses" ? -lossAmt : name === "Refunds" ? refundAmt : null;
  return (
    <div style={{ background: "#1a1a2e", border: "1px solid #444", borderRadius: 8, color: "#fff", fontSize: 12 }} className="px-3 py-2 text-xs leading-5">
      <p style={{ color: entry.payload.color, fontWeight: 700 }}>{name}: {count} bets</p>
      {amt !== null && (
        <p className="font-mono">{name !== "Losses" && amt >= 0 ? "+" : ""}{amt.toFixed(2)} DORA</p>
      )}
      {name === "Refunds" && <p className="text-gray-400 text-[10px]">Returned — no opposing bets</p>}
      {name === "Pending" && <p className="text-gray-400">Awaiting resolution</p>}
    </div>
  );
}

export default function ProfilePage() {
  const { user, getToken, refreshUser } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [doraBets, setDoraBets] = useState<BetWithRound[]>([]);
  const [betsLoading, setBetsLoading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [followStats, setFollowStats] = useState({ followersCount: 0, followingCount: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setMounted(true); }, []);

  const fetchDoraBets = useCallback(() => {
    if (!user) return;
    fetch(`/api/bets?wallet=dora:${user.id}`, { cache: "no-store" })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setDoraBets(data); })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setBetsLoading(true);
    fetchDoraBets();
    setBetsLoading(false);
    const id = setInterval(() => { fetchDoraBets(); refreshUser(); }, 10000);
    return () => clearInterval(id);
  }, [user, fetchDoraBets, refreshUser]);

  useEffect(() => {
    if (!user) return;
    fetch(`/api/user/stats?userId=${user.id}`)
      .then(r => r.json())
      .then(d => setFollowStats(d))
      .catch(() => {});
  }, [user]);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const token = getToken();
      const res = await fetch("/api/user/avatar", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setAvatarPreview(data.avatarUrl);
      await refreshUser();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  // ── Not logged in gate ────────────────────────────────────────────────────
  if (!mounted || !user) {
    return (
      <div className="min-h-screen bg-base flex flex-col items-center justify-center gap-4">
        <Navbar rounds={[]} />
        <p className="text-white text-lg font-semibold">Login to view your profile</p>
        <button
          onClick={() => setShowAuthModal(true)}
          className="px-5 py-2.5 rounded-xl font-bold border border-brand/40 text-brand hover:bg-brand/10 transition-colors"
        >
          Login / Register
        </button>
        <Link href="/" className="text-muted text-sm hover:text-white transition-colors">← Back to markets</Link>
        {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      </div>
    );
  }

  // ── Stats helpers ─────────────────────────────────────────────────────────
  function betStats(bets: BetWithRound[]) {
    const resolved = bets.filter(b => b.result !== null && b.result !== "refund");
    const wins     = resolved.filter(b => b.result === b.side);
    const wagered  = bets.reduce((s, b) => s + b.amount, 0);
    const winRate  = resolved.length > 0 ? ((wins.length / resolved.length) * 100).toFixed(0) : "0";
    return { resolved, wins, wagered, winRate };
  }

  // ── PnL chart data builder ────────────────────────────────────────────────
  function buildPnlData(bets: BetWithRound[]) {
    let cumulative = 0;
    return [...bets]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((b, i) => {
        const isRefund = b.result === "refund";
        const isWin    = !isRefund && b.result !== null && b.result === b.side;
        const isLoss   = !isRefund && b.result !== null && b.result !== b.side;
        const profit   = isWin ? (b.payout ?? 0) - b.amount : isLoss ? -b.amount : 0;
        cumulative += profit;
        return {
          name: `#${i + 1}`,
          pnl: parseFloat(cumulative.toFixed(4)),
          profit: parseFloat(profit.toFixed(4)),
          question: b.round?.question?.slice(0, 30) ?? b.roundId,
          result: isWin ? "WIN" : isLoss ? "LOSS" : isRefund ? "REFUND" : "Pending",
          side: b.side,
        };
      });
  }

  // ── Trading History Chart ─────────────────────────────────────────────────
  function TradingHistoryChart({ bets }: { bets: BetWithRound[] }) {
    const resolved = bets.filter(b => b.result !== null && b.result !== "refund");
    if (resolved.length === 0) return null;

    const sorted = [...resolved].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const last20 = sorted.slice(-20);

    let cumulative = 0;
    const data = last20.map((b, i) => {
      const isWin  = b.result === b.side;
      const profit = isWin ? (b.payout ?? 0) - b.amount : -b.amount;
      cumulative += profit;
      return {
        name: `#${i + 1}`,
        profit: parseFloat(profit.toFixed(2)),
        pnl:    parseFloat(cumulative.toFixed(2)),
        amount: b.amount,
        result: isWin ? "Won" : "Lost",
        date:   new Date(b.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
        market: b.round?.question?.slice(0, 40) ?? b.roundId,
      };
    });

    const totalWon  = resolved.filter(b => b.result === b.side).reduce((s, b) => s + ((b.payout ?? 0) - b.amount), 0);
    const totalLost = resolved.filter(b => b.result !== b.side).reduce((s, b) => s + b.amount, 0);
    const bestWin   = Math.max(0, ...resolved.filter(b => b.result === b.side).map(b => (b.payout ?? 0) - b.amount));
    const worstLoss = Math.max(0, ...resolved.filter(b => b.result !== b.side).map(b => b.amount));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const CustomTooltip = ({ active, payload }: any) => {
      if (!active || !payload?.length) return null;
      const d = payload[0].payload;
      return (
        <div className="bg-[#0f0f1a] border border-white/10 rounded-lg px-3 py-2 text-xs leading-5 max-w-[200px]">
          <p className="text-white/40 mb-1">{d.date} · Bet {d.name}</p>
          <p className={`font-semibold ${d.result === "Won" ? "text-[#22c55e]" : "text-red-400"}`}>{d.result}</p>
          <p className="text-white/60">Stake: <span className="text-white font-mono">{d.amount.toFixed(2)} DORA</span></p>
          <p className="text-white/60">P&L: <span className={`font-mono font-semibold ${d.profit >= 0 ? "text-[#22c55e]" : "text-red-400"}`}>{d.profit >= 0 ? "+" : ""}{d.profit.toFixed(2)}</span></p>
          <p className="text-white/60">Cumulative: <span className="font-mono text-white">{d.pnl >= 0 ? "+" : ""}{d.pnl.toFixed(2)}</span></p>
          <p className="text-white/30 text-[10px] mt-1 truncate">{d.market}</p>
        </div>
      );
    };

    return (
      <div className="bg-surface border border-surface-3 rounded-xl p-4 mb-6">
        <h2 className="text-white font-semibold text-sm mb-4">Trading History</h2>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[
            { label: "Total Won",   value: `+${totalWon.toFixed(2)}`,  color: "text-[#22c55e]" },
            { label: "Total Lost",  value: `-${totalLost.toFixed(2)}`, color: "text-red-400"   },
            { label: "Best Win",    value: `+${bestWin.toFixed(2)}`,   color: "text-[#22c55e]" },
            { label: "Worst Loss",  value: `-${worstLoss.toFixed(2)}`, color: "text-red-400"   },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
              <p className="text-[10px] uppercase tracking-widest text-muted mb-1">{label}</p>
              <p className={`font-mono font-semibold text-sm ${color}`}>{value} DORA</p>
            </div>
          ))}
        </div>

        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#4b5563" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#4b5563" }} axisLine={false} tickLine={false} width={52}
              tickFormatter={v => `${v >= 0 ? "+" : ""}${v.toFixed(0)}`} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
            <Legend formatter={v => <span style={{ color: "#6b7280", fontSize: 11 }}>{v}</span>} />
            <Bar dataKey="profit" name="Bet P&L" radius={[3, 3, 0, 0]}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              fill="#22c55e" isAnimationActive={false} label={false}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              shape={(props: any) => {
                const { x, y, width, height, value } = props;
                const fill = value >= 0 ? "#22c55e" : "#ef4444";
                const h    = Math.abs(height);
                const yPos = value >= 0 ? y : y + height - h;
                return <rect x={x} y={yPos} width={width} height={h} fill={fill} rx={3} />;
              }}
            />
            <Line type="monotone" dataKey="pnl" name="Cumulative P&L" stroke="#6366f1"
              strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // ── Shared section components ─────────────────────────────────────────────
  function PerformanceChart({ bets, unit }: { bets: BetWithRound[]; unit: string }) {
    if (bets.length === 0) return null;
    const { resolved, wins } = betStats(bets);
    const refunded = bets.filter(b => b.result === "refund");
    const pending  = bets.length - resolved.length - refunded.length;

    const pieData = [
      { name: "Wins",    value: wins.length,       color: "#22c55e" },
      { name: "Losses",  value: resolved.length - wins.length, color: "#ef4444" },
      { name: "Refunds", value: refunded.length,   color: "#6b7280" },
      { name: "Pending", value: pending,            color: "#374151" },
    ].filter(d => d.value > 0);

    const pnlData = buildPnlData(bets);

    return (
      <div className="bg-surface border border-surface-3 rounded-xl p-4 mb-6">
        <h2 className="text-white font-semibold text-sm mb-6">Performance ({unit})</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted mb-3">Win Rate</p>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} innerRadius={45}>
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip content={<PieTooltip bets={bets} />} />
                <Legend formatter={(value) => <span style={{ color: "#9ca3af", fontSize: 11 }}>{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="md:col-span-2">
            <p className="text-[10px] uppercase tracking-widest text-muted mb-3">Cumulative P&amp;L ({unit})</p>
            <ResponsiveContainer width="100%" height={180} debounce={50}>
              <LineChart data={pnlData} margin={{ top: 10, right: 40, left: 20, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="name" stroke="#4b5563" tick={{ fontSize: 12, fill: "#6b7280" }} interval="preserveStartEnd" />
                <YAxis stroke="#4b5563" tick={{ fontSize: 12, fill: "#6b7280" }} width={50}
                  tickFormatter={v => `${v > 0 ? "+" : ""}${v.toFixed(2)}`} />
                <Tooltip
                  isAnimationActive={false}
                  contentStyle={{ background: "#1a1a2e", border: "1px solid #444", borderRadius: "8px", color: "#fff", fontSize: "12px" }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(_value: any, _name: any, props: any) => {
                    const d = props.payload;
                    const color = d.result === "WIN" ? "#22c55e" : d.result === "REFUND" ? "#6b7280" : d.result === "LOSS" ? "#ef4444" : "#6b7280";
                    return [<span key="v" style={{ color }}>{`${d.result} | ${d.side?.toUpperCase()} | ${d.profit > 0 ? "+" : ""}${d.profit} ${unit}`}</span>];
                  }}
                  labelFormatter={() => ""}
                />
                <Line type="monotone" dataKey="pnl" name="P&L" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  activeDot={(props: any) => {
                    const color = props.payload?.result === "WIN" ? "#22c55e" : props.payload?.result === "LOSS" ? "#ef4444" : "#6b7280";
                    return <circle cx={props.cx} cy={props.cy} r={7} fill={color} stroke="#fff" strokeWidth={2} />;
                  }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  }

  function BetTable({ bets, unit }: { bets: BetWithRound[]; unit: string }) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-muted border-b border-surface-3">
              <th className="text-left px-4 py-2.5">Market</th>
              <th className="text-center px-3 py-2.5">Bet</th>
              <th className="text-center px-3 py-2.5">Result</th>
              <th className="text-right px-3 py-2.5">Amount</th>
              <th className="text-right px-3 py-2.5">Payout</th>
              <th className="text-center px-3 py-2.5">Status</th>
              <th className="text-right px-4 py-2.5">Date</th>
            </tr>
          </thead>
          <tbody>
            {bets.map((bet) => {
              const { label, color } = resultLabel(bet);
              const isRefund = bet.result === "refund";
              const isWin    = !isRefund && bet.result !== null && bet.result === bet.side;
              const isLoss   = !isRefund && bet.result !== null && bet.result !== bet.side;
              const estPayout = bet.amount * bet.odds;
              return (
                <tr key={bet.id} className="border-b border-surface-3/50 hover:bg-surface-2/50 transition-colors">
                  <td className="px-4 py-3 text-muted text-xs">{bet.round?.question ?? bet.roundId}</td>
                  <td className="px-3 py-3 text-center">
                    {(() => {
                      const c = OUTCOME_COLORS[bet.side];
                      const outcomeLabel = bet.round?.outcomes?.find(o => o.id === bet.side)?.label;
                      if (c && outcomeLabel) {
                        return (
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${c.bg} ${c.text} border ${c.border} max-w-[130px] truncate`}>
                            <span className="font-bold">{bet.side}</span>
                            <span className="opacity-70 truncate">· {outcomeLabel}</span>
                          </span>
                        );
                      }
                      return (
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${bet.side === "yes" ? "bg-yes/10 text-yes" : "bg-no/10 text-no"}`}>
                          {bet.side.toUpperCase()}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {bet.round?.status === "resolved" && bet.round.winningOutcome ? (
                      (() => {
                        const wc = OUTCOME_COLORS[bet.round.winningOutcome];
                        const wLabel = bet.round.outcomes?.find(o => o.id === bet.round!.winningOutcome)?.label;
                        const won = bet.side === bet.round.winningOutcome;
                        return (
                          <div className="flex flex-col items-center gap-0.5">
                            {wc && wLabel ? (
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${wc.bg} ${wc.text} border ${wc.border} max-w-[130px] truncate`}>
                                <span className="font-bold">{bet.round.winningOutcome}</span>
                                <span className="opacity-70 truncate">· {wLabel}</span>
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted">{bet.round.winningOutcome}</span>
                            )}
                            <span className={`text-[10px] font-semibold ${won ? "text-[#22c55e]" : "text-red-400"}`}>
                              {won ? "✓ Won" : "✗ Lost"}
                            </span>
                          </div>
                        );
                      })()
                    ) : (
                      <span className="text-white/20 text-[10px]">Pending</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-white text-xs">
                    {bet.amount.toFixed(2)} {unit}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-xs">
                    {isWin && bet.payout != null ? (
                      <span className="text-yes font-semibold">+{bet.payout.toFixed(2)} {unit}</span>
                    ) : isRefund ? (
                      <span className="text-gray-400">{bet.amount.toFixed(2)} {unit}</span>
                    ) : isLoss ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <span className="text-white">{estPayout.toFixed(2)} {unit}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className={`text-xs font-semibold ${color}`}>{label}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-muted text-xs">
                    {new Date(bet.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-base pt-16">
      <Navbar rounds={[]} />
      <div className="max-w-4xl mx-auto px-4 py-8">

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-white font-bold text-2xl">Profile</h1>
          <Link href="/" className="text-muted text-sm hover:text-white transition-colors">← Markets</Link>
        </div>

        {/* ── DORA user card ──────────────────────────────────────────── */}
        {user && (() => {
          const { wins, resolved, wagered, winRate } = betStats(doraBets);
          const netPnl = doraBets.reduce((s, b) => {
            if (b.result === "refund") return s;
            if (b.result === b.side && b.result !== null) return s + ((b.payout ?? 0) - b.amount);
            if (b.result !== null) return s - b.amount;
            return s;
          }, 0);

          return (
            <>
              <div className="bg-surface border border-brand/20 rounded-xl p-5 mb-6">
                <div className="flex flex-wrap items-center gap-5">
                  {/* Clickable avatar with upload */}
                  <div className="relative shrink-0 group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                    <Avatar username={user.username} avatarUrl={avatarPreview ?? user.avatarUrl} size={64} />
                    <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      {uploading ? (
                        <svg className="animate-spin w-5 h-5 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
                        </svg>
                      )}
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                  </div>

                  {/* User info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white font-bold text-xl">{user.username}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-brand/10 border border-brand/20 text-brand font-medium">DORA</span>
                    </div>
                    <p className="text-muted text-xs mb-2">{user.email}</p>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-muted"><span className="text-white font-semibold">{followStats.followersCount}</span> followers</span>
                      <span className="text-muted"><span className="text-white font-semibold">{followStats.followingCount}</span> following</span>
                    </div>
                  </div>

                  {/* DORA balance */}
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] uppercase tracking-widest text-muted mb-1">DORA Balance</p>
                    <p className="text-brand font-mono font-bold text-2xl">
                      {Math.floor(user.doraBalance).toLocaleString("en-US")}
                      <span className="text-sm font-normal ml-1">DORA</span>
                    </p>
                    {netPnl !== 0 && (
                      <p className={`text-xs font-mono mt-0.5 ${netPnl > 0 ? "text-yes" : "text-no"}`}>
                        {netPnl > 0 ? "+" : ""}{netPnl.toFixed(2)} P&L
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* DORA stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {[
                  { label: "Total Bets", value: doraBets.length.toString() },
                  { label: "Total Wagered", value: `${wagered.toFixed(0)} DORA` },
                  { label: "Wins / Losses", value: `${wins.length} / ${resolved.length - wins.length}` },
                  { label: "Win Rate", value: `${winRate}%` },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-surface border border-surface-3 rounded-xl p-3">
                    <p className="text-[10px] uppercase tracking-widest text-muted mb-1">{label}</p>
                    <p className="text-white font-semibold font-mono">{value}</p>
                  </div>
                ))}
              </div>

              <PerformanceChart bets={doraBets} unit="DORA" />

              <TradingHistoryChart bets={doraBets} />

              {/* DORA bet history */}
              <div className="bg-surface border border-surface-3 rounded-xl overflow-hidden mb-6">
                <div className="px-4 py-3 border-b border-surface-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-brand" />
                  <h2 className="text-white font-semibold">DORA Bet History</h2>
                </div>
                {betsLoading ? (
                  <div className="p-8 text-center text-muted text-sm">Loading…</div>
                ) : doraBets.length === 0 ? (
                  <div className="p-10 flex flex-col items-center gap-2">
                    <p className="text-3xl">🎯</p>
                    <p className="text-white font-semibold mt-1">No DORA bets yet</p>
                    <p className="text-muted text-sm">Head back to markets and place your first virtual bet.</p>
                    <Link href="/" className="mt-3 px-4 py-2 rounded-lg text-sm font-semibold bg-brand hover:bg-brand-dim text-black transition-colors">
                      Browse Markets
                    </Link>
                  </div>
                ) : (
                  <BetTable bets={doraBets} unit="DORA" />
                )}
              </div>
            </>
          );
        })()}

      </div>
    </div>
  );
}
