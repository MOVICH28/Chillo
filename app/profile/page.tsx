"use client";

export const dynamic = "force-dynamic";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/components/WalletProvider";
import { useAuth } from "@/lib/useAuth";
import { useSolBalance } from "@/lib/useSolBalance";
import { useLiveData } from "@/lib/useLiveData";
import Navbar from "@/components/Navbar";
import AuthModal from "@/components/AuthModal";

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
  round: { question: string; status: string; winningOutcome: string | null; outcomes: { id: string; label: string }[] | null } | null;
}

interface ReferralStats {
  referralCount: number;
  totalEarned: number;
  referrals: { referredAddress: string; createdAt: string }[];
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

const BASE_URL = "https://chillo-f11o.vercel.app";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PieTooltip({ active, payload, bets, solPrice, isDora }: any) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const name: string  = entry.name;
  const count: number = entry.value;
  const unit = isDora ? "DORA" : "SOL";
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
        <p className="font-mono">
          {name !== "Losses" && amt >= 0 ? "+" : ""}{amt.toFixed(2)} {unit}
          {!isDora && solPrice && <span className="text-gray-400 ml-1">(${Math.abs(amt * solPrice).toFixed(2)})</span>}
        </p>
      )}
      {name === "Refunds" && <p className="text-gray-400 text-[10px]">Returned — no opposing bets</p>}
      {name === "Pending" && <p className="text-gray-400">Awaiting resolution</p>}
    </div>
  );
}

export default function ProfilePage() {
  const { publicKey, connected, connect } = useWallet();
  const { user, refreshUser } = useAuth();
  const balance = useSolBalance(connected ? publicKey : null);
  const { data: liveData } = useLiveData();
  const solPrice = liveData.sol?.price ?? null;

  const [mounted, setMounted] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Wallet bets
  const [walletBets, setWalletBets] = useState<BetWithRound[]>([]);
  // DORA bets
  const [doraBets, setDoraBets] = useState<BetWithRound[]>([]);
  const [betsLoading, setBetsLoading] = useState(false);

  const [refStats, setRefStats] = useState<ReferralStats | null>(null);
  const [copied, setCopied] = useState(false);

  // Wallet username/avatar (SOL mode)
  const [avatar, setAvatar] = useState("");
  const [walletUsername, setWalletUsername] = useState("");
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!publicKey) { setAvatar(""); setWalletUsername(""); return; }
    setAvatar(localStorage.getItem(`avatar_${publicKey}`) ?? "");
    const saved = localStorage.getItem(`username_${publicKey}`) ?? "";
    setWalletUsername(saved);
    setUsernameInput(saved);
  }, [publicKey]);

  function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !publicKey) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 200; canvas.height = 200;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, 200, 200);
        const base64 = canvas.toDataURL("image/jpeg", 0.8);
        localStorage.setItem(`avatar_${publicKey}`, base64);
        setAvatar(base64);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function saveUsername() {
    if (!publicKey) return;
    const clean = usernameInput.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20);
    setUsernameInput(clean);
    localStorage.setItem(`username_${publicKey}`, clean);
    setWalletUsername(clean);
    setEditingUsername(false);
    window.dispatchEvent(new Event("usernameChanged"));
  }

  // Fetch wallet bets
  const fetchWalletBets = useCallback(() => {
    if (!publicKey) return;
    fetch(`/api/bets?wallet=${publicKey}`, { cache: "no-store" })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setWalletBets(data); })
      .catch(() => {});
  }, [publicKey]);

  // Fetch DORA bets
  const fetchDoraBets = useCallback(() => {
    if (!user) return;
    fetch(`/api/bets?wallet=dora:${user.id}`, { cache: "no-store" })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setDoraBets(data); })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!publicKey && !user) return;
    setBetsLoading(true);
    if (publicKey) fetchWalletBets();
    if (user) fetchDoraBets();
    setBetsLoading(false);

    const id = setInterval(() => {
      if (publicKey) fetchWalletBets();
      if (user) { fetchDoraBets(); refreshUser(); }
    }, 10000);

    if (publicKey) {
      fetch(`/api/referral?wallet=${publicKey}`)
        .then(r => r.json())
        .then(data => { if (data && typeof data.referralCount === "number") setRefStats(data); })
        .catch(() => {});
    }

    return () => clearInterval(id);
  }, [publicKey, user, fetchWalletBets, fetchDoraBets, refreshUser]);

  const hasIdentity = connected || !!user;

  // ── Not connected gate ────────────────────────────────────────────────────
  if (!mounted || !hasIdentity) {
    return (
      <div className="min-h-screen bg-base flex flex-col items-center justify-center gap-4">
        <Navbar rounds={[]} />
        <p className="text-white text-lg font-semibold">Connect to view your profile</p>
        <div className="flex gap-3">
          <button
            onClick={connect}
            className="px-5 py-2.5 rounded-xl font-bold text-black bg-brand hover:bg-brand-dim transition-colors"
          >
            Connect Wallet
          </button>
          <button
            onClick={() => setShowAuthModal(true)}
            className="px-5 py-2.5 rounded-xl font-bold border border-brand/40 text-brand hover:bg-brand/10 transition-colors"
          >
            Login with DORA
          </button>
        </div>
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

  const usd = (sol: number) => solPrice ? `$${(sol * solPrice).toFixed(2)}` : null;
  const refCode = publicKey ?? "";
  const refLink = `${BASE_URL}/?ref=${refCode}`;

  function copyRefLink() {
    navigator.clipboard.writeText(refLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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

  // ── Shared section components ─────────────────────────────────────────────
  function PerformanceChart({ bets, unit }: { bets: BetWithRound[]; unit: string }) {
    if (bets.length === 0) return null;
    const { resolved, wins } = betStats(bets);
    const refunded = bets.filter(b => b.result === "refund");
    const pending  = bets.length - resolved.length - refunded.length;
    const isDora   = unit === "DORA";

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
                <Tooltip content={<PieTooltip bets={bets} solPrice={solPrice} isDora={isDora} />} />
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
    const isDora = unit === "DORA";
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
                    {!isDora && solPrice && <div className="text-muted text-[10px]">{usd(bet.amount)}</div>}
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
                  {/* Avatar: first letter of username */}
                  <div className="w-16 h-16 rounded-full bg-brand/20 border-2 border-brand/30 flex items-center justify-center text-brand font-bold text-2xl select-none shrink-0">
                    {user.username.slice(0, 1).toUpperCase()}
                  </div>

                  {/* User info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white font-bold text-xl">{user.username}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-brand/10 border border-brand/20 text-brand font-medium">DORA</span>
                    </div>
                    <p className="text-muted text-xs">{user.email}</p>
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

        {/* ── Wallet card (SOL mode, only when no DORA user) ─────────── */}
        {connected && publicKey && !user && (() => {
          const { wins, resolved, wagered, winRate } = betStats(walletBets);
          return (
            <>
              <div className="bg-surface border border-surface-3 rounded-xl p-5 mb-6">
                <div className="flex flex-wrap items-center gap-5">
                  {/* Avatar */}
                  <label className="relative cursor-pointer shrink-0 group">
                    <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                    <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-surface-3 group-hover:border-brand transition-colors">
                      {avatar ? (
                        <img src={avatar} alt="avatar" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-brand/20 flex items-center justify-center text-brand font-bold text-xl select-none">
                          {publicKey.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-white text-[10px] font-semibold">Edit</span>
                    </div>
                  </label>

                  {/* Username + wallet */}
                  <div className="flex-1 min-w-0">
                    {editingUsername ? (
                      <div className="flex items-center gap-2 mb-1">
                        <input
                          autoFocus
                          value={usernameInput}
                          onChange={e => setUsernameInput(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20))}
                          onKeyDown={e => { if (e.key === "Enter") saveUsername(); if (e.key === "Escape") setEditingUsername(false); }}
                          placeholder="username"
                          className="bg-surface-2 border border-surface-3 focus:border-brand outline-none rounded-lg px-3 py-1.5 text-white text-lg font-bold w-40 transition-colors"
                        />
                        <button onClick={saveUsername} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand hover:bg-brand-dim text-black transition-colors">Save</button>
                        <button onClick={() => setEditingUsername(false)} className="px-3 py-1.5 rounded-lg text-xs text-muted hover:text-white transition-colors">Cancel</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-white font-bold text-xl truncate">
                          {walletUsername || <span className="text-muted font-normal text-base">Set username</span>}
                        </span>
                        <button onClick={() => setEditingUsername(true)} className="text-muted hover:text-white transition-colors shrink-0" title="Edit username">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                          </svg>
                        </button>
                      </div>
                    )}
                    <p className="text-muted text-xs font-mono truncate">{publicKey}</p>
                  </div>

                  {/* SOL balance */}
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] uppercase tracking-widest text-muted mb-1">SOL Balance</p>
                    <p className="text-brand font-mono font-semibold text-lg">
                      {balance !== null ? `${balance.toFixed(4)} SOL` : "—"}
                      {balance !== null && solPrice && (
                        <span className="text-muted font-normal ml-2 text-xs">{usd(balance)}</span>
                      )}
                    </p>
                    <span className="px-2 py-0.5 rounded text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">devnet</span>
                  </div>
                </div>
              </div>

              {/* SOL stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {[
                  { label: "Total Bets", value: walletBets.length.toString() },
                  { label: "Total Wagered", value: `${wagered.toFixed(3)} SOL` },
                  { label: "Wins / Losses", value: `${wins.length} / ${resolved.length - wins.length}` },
                  { label: "Win Rate", value: `${winRate}%` },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-surface border border-surface-3 rounded-xl p-3">
                    <p className="text-[10px] uppercase tracking-widest text-muted mb-1">{label}</p>
                    <p className="text-white font-semibold font-mono">{value}</p>
                  </div>
                ))}
              </div>

              <PerformanceChart bets={walletBets} unit="SOL" />

              {/* Referral section */}
              <div id="referral" className="bg-surface border border-surface-3 rounded-xl overflow-hidden mb-6">
                <div className="px-4 py-3 border-b border-surface-3 flex items-center gap-2">
                  <span className="text-brand text-sm">🔗</span>
                  <h2 className="text-white font-semibold">Referral Program</h2>
                </div>
                <div className="p-4 space-y-4">
                  <div className="flex flex-col sm:flex-row gap-3 text-xs text-muted">
                    {[{ icon: "🔗", text: "Share your unique link" }, { icon: "💸", text: "Earn 1% of every bet they place" }].map(({ icon, text }) => (
                      <div key={text} className="flex items-center gap-2 bg-surface-2 rounded-lg px-3 py-2 flex-1">
                        <span>{icon}</span><span>{text}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Your referral link</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-surface-2 border border-surface-3 rounded-lg px-3 py-2 font-mono text-xs text-muted truncate">{refLink}</div>
                      <button
                        onClick={copyRefLink}
                        className={`shrink-0 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${copied ? "bg-yes/20 text-yes border border-yes/30" : "bg-brand hover:bg-brand-dim text-black"}`}
                      >
                        {copied ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-surface-2 border border-surface-3 rounded-xl p-3">
                      <p className="text-[10px] uppercase tracking-widest text-muted mb-1">People Invited</p>
                      <p className="text-white font-bold font-mono text-lg">{refStats?.referralCount ?? 0}</p>
                    </div>
                    <div className="bg-surface-2 border border-surface-3 rounded-xl p-3">
                      <p className="text-[10px] uppercase tracking-widest text-muted mb-1">Total Earned</p>
                      <p className="text-brand font-bold font-mono text-lg">{(refStats?.totalEarned ?? 0).toFixed(4)} SOL</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted">
                    Earn <span className="text-brand">1% of every bet</span> placed by wallets you refer. Paid automatically in SOL.
                  </p>
                </div>
              </div>

              {/* Wallet bet history */}
              <div className="bg-surface border border-surface-3 rounded-xl overflow-hidden mb-6">
                <div className="px-4 py-3 border-b border-surface-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-yellow-400" />
                  <h2 className="text-white font-semibold">SOL Bet History</h2>
                </div>
                {betsLoading ? (
                  <div className="p-8 text-center text-muted text-sm">Loading…</div>
                ) : walletBets.length === 0 ? (
                  <div className="p-10 flex flex-col items-center gap-2">
                    <p className="text-3xl">🎯</p>
                    <p className="text-white font-semibold mt-1">No SOL bets yet</p>
                    <p className="text-muted text-sm">Connect a wallet and place your first bet.</p>
                    <Link href="/" className="mt-3 px-4 py-2 rounded-lg text-sm font-semibold bg-brand hover:bg-brand-dim text-black transition-colors">Browse Markets</Link>
                  </div>
                ) : (
                  <BetTable bets={walletBets} unit="SOL" />
                )}
              </div>
            </>
          );
        })()}

      </div>
    </div>
  );
}
