"use client";

export const dynamic = "force-dynamic";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import Navbar from "@/components/Navbar";
import AuthModal from "@/components/AuthModal";
import Avatar from "@/components/Avatar";
import Sidebar from "@/components/Sidebar";
import RightPanel from "@/components/RightPanel";

import {
  PieChart, Pie, Cell,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
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
  round: { question: string; status: string; winningOutcome: string | null; outcomes: { id: string; label: string }[] | null; roundNumber?: number | null } | null;
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
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [doraBets, setDoraBets] = useState<BetWithRound[]>([]);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [followStats, setFollowStats] = useState({ followersCount: 0, followingCount: 0, createdMarketsCount: 0 });
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
    fetchDoraBets();
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

    const totalWon  = resolved.filter(b => b.result === b.side).reduce((s, b) => s + ((b.payout ?? 0) - b.amount), 0);
    const totalLost = resolved.filter(b => b.result !== b.side).reduce((s, b) => s + b.amount, 0);
    const bestWin   = Math.max(0, ...resolved.filter(b => b.result === b.side).map(b => (b.payout ?? 0) - b.amount));
    const worstLoss = Math.max(0, ...resolved.filter(b => b.result !== b.side).map(b => b.amount));

    const sorted = [...bets].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return (
      <div className="bg-surface border border-surface-3 rounded-xl p-4 mb-6">
        <h2 className="text-white font-semibold text-sm mb-4">Trading History</h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[
            { label: "Total Won",  value: `+${totalWon.toFixed(2)}`,  color: "text-[#22c55e]" },
            { label: "Total Lost", value: `-${totalLost.toFixed(2)}`, color: "text-red-400"   },
            { label: "Best Win",   value: `+${bestWin.toFixed(2)}`,   color: "text-[#22c55e]" },
            { label: "Worst Loss", value: `-${worstLoss.toFixed(2)}`, color: "text-red-400"   },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
              <p className="text-[10px] uppercase tracking-widest text-muted mb-1">{label}</p>
              <p className={`font-mono font-semibold text-sm ${color}`}>{value} DORA</p>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-muted border-b border-surface-3">
                <th className="text-left px-3 py-2 whitespace-nowrap">Date</th>
                <th className="text-left px-3 py-2 w-full">Market</th>
                <th className="text-center px-3 py-2">Outcome</th>
                <th className="text-right px-3 py-2">Stake</th>
                <th className="text-center px-3 py-2">Result</th>
                <th className="text-right px-3 py-2">P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(b => {
                const isRefund  = b.result === "refund";
                const isWin     = !isRefund && b.result !== null && b.result === b.side;
                const isLoss    = !isRefund && b.result !== null && b.result !== b.side;
                const isPending = b.result === null;
                const profit = isWin ? (b.payout ?? 0) - b.amount : isLoss ? -b.amount : null;
                const resLabel = isWin ? "Won" : isLoss ? "Lost" : isRefund ? "Refund" : "Pending";
                const resColor = isWin ? "text-[#22c55e]" : isLoss ? "text-red-400" : isPending ? "text-yellow-400" : "text-muted";
                const plColor  = profit === null ? "text-muted" : profit >= 0 ? "text-[#22c55e]" : "text-red-400";
                return (
                  <tr key={b.id} className="border-b border-surface-3/50 hover:bg-white/[0.02] transition-colors">
                    <td className="px-3 py-2.5 text-muted whitespace-nowrap text-[11px]">
                      {new Date(b.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </td>
                    <td className="px-3 py-2.5 max-w-0 w-full">
                      <div
                        className="truncate text-white/60 text-xs"
                        title={b.round?.question ?? b.roundId}
                      >
                        {b.round?.roundNumber != null && (
                          <span className="text-muted font-mono mr-1">#{b.round.roundNumber} ·</span>
                        )}
                        {b.round?.question ?? b.roundId}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center font-bold text-white/80 font-mono">{b.side}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-white/80">{b.amount.toFixed(2)}</td>
                    <td className={`px-3 py-2.5 text-center font-semibold ${resColor}`}>{resLabel}</td>
                    <td className={`px-3 py-2.5 text-right font-mono font-semibold ${plColor}`}>
                      {profit === null ? "—" : `${profit >= 0 ? "+" : ""}${profit.toFixed(2)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} innerRadius={45} isAnimationActive={false}>
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
                <Line type="monotone" dataKey="pnl" name="P&L" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false}
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



  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-base pt-16">
      <Navbar rounds={[]} />
      <div className="flex flex-row gap-6 max-w-[1400px] mx-auto w-full px-4">

        {/* Left sidebar */}
        <div className="hidden lg:flex flex-col gap-4 w-72 shrink-0 overflow-y-auto py-6 no-scrollbar sticky top-16 self-start max-h-[calc(100vh-64px)]">
          <Sidebar active="all" onSelect={(cat) => router.push(`/?cat=${cat}`)} counts={{}} />
          <RightPanel rounds={[]} />
        </div>

        {/* Main content */}
        <main className="flex-1 min-w-0 py-6">

        {/* Back arrow */}
        <Link href="/" className="flex items-center text-white/40 hover:text-white/70 transition-colors mb-6 w-fit">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>

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
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      <span><span className="text-white font-semibold">{followStats.followersCount}</span> followers</span>
                      <span className="text-white/20">·</span>
                      <span><span className="text-white font-semibold">{followStats.followingCount}</span> following</span>
                      <span className="text-white/20">·</span>
                      <span><span className="text-white font-semibold">{followStats.createdMarketsCount}</span> created</span>
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
            </>
          );
        })()}

        </main>
      </div>
    </div>
  );
}
