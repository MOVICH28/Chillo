"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";
import Avatar from "@/components/Avatar";
import RightPanel from "@/components/RightPanel";
import { useAuth } from "@/lib/useAuth";

interface LeaderboardEntry {
  walletAddress:  string;
  username:       string | null;
  avatarUrl:      string | null;
  totalWins:      number;
  totalLosses:    number;
  totalBets:      number;
  totalWagered:   number;
  totalPayout:    number;
  profit:         number;
  winRate:        number;
  marketsCreated: number;
}

interface Stats24h { volume24h: number; bets24h: number; activeMarkets: number; }

const RANK_STYLES: Record<number, { bg: string; text: string; label: string }> = {
  1: { bg: "bg-yellow-500/10 border-yellow-500/30", text: "text-yellow-400", label: "🥇" },
  2: { bg: "bg-gray-400/10 border-gray-400/30",     text: "text-gray-300",   label: "🥈" },
  3: { bg: "bg-orange-500/10 border-orange-500/30", text: "text-orange-400", label: "🥉" },
};

function shortAddress(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function fmtVol(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(0);
}

// ── Sidebar Stats ─────────────────────────────────────────────────────────────

function SidebarStats() {
  const [stats, setStats] = useState<Stats24h>({ volume24h: 0, bets24h: 0, activeMarkets: 0 });

  useEffect(() => {
    const load = () => fetch("/api/stats").then(r => r.json()).then(setStats).catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mt-4 pt-3 border-t border-surface-3 flex flex-col gap-1">
      <p className="px-2 text-[10px] uppercase tracking-widest text-muted mb-1">Today</p>
      <div className="px-2 flex flex-col gap-1.5">
        {[
          { label: "Volume", value: `${fmtVol(stats.volume24h)} DORA`, color: "text-brand" },
          { label: "Bets",   value: String(stats.bets24h),              color: "text-white" },
          { label: "Markets",value: String(stats.activeMarkets),         color: "text-white" },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex items-center justify-between">
            <span className="text-[11px] text-muted">{label}</span>
            <span className={`text-[11px] font-mono font-semibold ${color}`}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Period = "24h" | "7d" | "all";

const PERIOD_LABELS: { key: Period; label: string }[] = [
  { key: "24h", label: "24h"      },
  { key: "7d",  label: "7 days"   },
  { key: "all", label: "All time" },
];

export default function LeaderboardPage() {
  const { user }                      = useAuth();
  const [rows,        setRows]        = useState<LeaderboardEntry[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [usernameMap, setUsernameMap] = useState<Record<string, string>>({});
  const [period,      setPeriod]      = useState<Period>("all");

  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch(`/api/leaderboard?period=${period}`, { cache: "no-store" });
      if (!res.ok) return;
      const data: LeaderboardEntry[] = await res.json();
      setRows(data);
      setLastUpdated(new Date());

      const map: Record<string, string> = {};
      for (const row of data) {
        const name = localStorage.getItem(`username_${row.walletAddress}`);
        if (name) map[row.walletAddress] = name;
      }
      setUsernameMap(map);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    setLoading(true);
    fetchLeaderboard();
    const id = setInterval(fetchLeaderboard, 30_000);
    return () => clearInterval(id);
  }, [fetchLeaderboard]);

  return (
    <div className="min-h-screen bg-base text-white">
      <Navbar rounds={[]} />

      <div className="flex flex-row gap-3 max-w-[1400px] mx-auto w-full px-2 mt-14">

        {/* Left Sidebar */}
        <div className="hidden lg:block w-40 shrink-0 overflow-y-auto py-6 no-scrollbar sticky top-14 self-start">
          <Sidebar active="all" onSelect={() => {}} counts={{}} />
          <SidebarStats />
        </div>

        {/* Main content */}
        <main className="min-w-0 flex-1 py-6 min-h-0">

          {/* Back arrow */}
          <Link href="/" className="flex items-center text-white/40 hover:text-white/70 transition-colors mb-4 w-fit">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>

          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🏆</span>
              <div>
                <h1 className="text-white font-bold text-2xl">Leaderboard</h1>
                <p className="text-muted text-xs mt-0.5">
                  Top 50 traders by profit · refreshes every 30s
                  {lastUpdated && (
                    <span className="ml-2 text-surface-3">· updated {lastUpdated.toLocaleTimeString()}</span>
                  )}
                </p>
              </div>
            </div>
            {/* Time filter tabs */}
            <div className="flex items-center gap-1 rounded-lg overflow-hidden border border-surface-3 bg-surface">
              {PERIOD_LABELS.map(p => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors
                    ${period === p.key ? "bg-brand text-black" : "text-muted hover:text-white"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="bg-surface border border-surface-3 rounded-xl overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-muted text-sm">Loading…</div>
            ) : rows.length === 0 ? (
              <div className="p-12 text-center text-muted text-sm">No bets placed yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-widest text-muted border-b border-surface-3">
                      <th className="text-center px-4 py-3 w-12">Rank</th>
                      <th className="text-left px-4 py-3">Player</th>
                      <th className="text-right px-3 py-3">Win Rate</th>
                      <th className="text-right px-3 py-3">Bets</th>
                      <th className="text-right px-3 py-3">Volume</th>
                      <th className="text-right px-3 py-3">Markets</th>
                      <th className="text-right px-4 py-3">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => {
                      const rank           = idx + 1;
                      const rankStyle      = RANK_STYLES[rank];
                      const displayName    = usernameMap[row.walletAddress] || shortAddress(row.walletAddress);
                      const profitPositive = row.profit >= 0;
                      const isCurrentUser  = user && (user.username === row.username);

                      function handleShareX() {
                        const name = row.username ?? displayName;
                        const sign = row.profit >= 0 ? "+" : "";
                        const text = `🏆 I'm ranked #${rank} on @pumpdora with ${sign}${row.profit.toFixed(0)} DORA profit!\nJoin with my referral link: pumpdora.com?ref=${name}\n#PredictionMarket #Solana #DORA`;
                        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
                      }

                      return (
                        <tr
                          key={row.walletAddress}
                          className={[
                            "border-b border-surface-3/50 transition-colors",
                            isCurrentUser ? "ring-1 ring-inset ring-brand/30" : "",
                            rank <= 3
                              ? `${rankStyle.bg} hover:brightness-110`
                              : "hover:bg-surface-2/50",
                          ].join(" ")}
                        >
                          {/* Rank */}
                          <td className="px-4 py-3 text-center">
                            {rank <= 3 ? (
                              <span className="text-lg leading-none">{rankStyle.label}</span>
                            ) : (
                              <span className="font-mono font-bold text-xs text-muted">#{rank}</span>
                            )}
                          </td>

                          {/* Player */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {row.username ? (
                                <Avatar username={row.username} avatarUrl={row.avatarUrl} size={28} className="shrink-0" />
                              ) : (
                                <div className="w-7 h-7 rounded-full border border-surface-3 shrink-0 flex items-center justify-center bg-white/5">
                                  <span className="text-white/30 font-bold text-[10px] select-none">
                                    {row.walletAddress.slice(0, 2).toUpperCase()}
                                  </span>
                                </div>
                              )}
                              <div>
                                {row.username ? (
                                  <Link
                                    href={`/profile/${row.username}`}
                                    className={`font-semibold hover:text-[#22c55e] hover:underline transition-colors ${rank <= 3 ? rankStyle.text : "text-white"}`}
                                  >
                                    {row.username}
                                  </Link>
                                ) : (
                                  <span className={`font-semibold ${rank <= 3 ? rankStyle.text : "text-white"}`}>
                                    {displayName}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Win Rate */}
                          <td className="px-3 py-3 text-right">
                            <span className={`font-mono text-xs font-semibold ${
                              row.winRate >= 60 ? "text-yes" : row.winRate >= 40 ? "text-white" : "text-no"
                            }`}>
                              {row.winRate.toFixed(0)}%
                            </span>
                            <div className="text-[10px] text-muted">{row.totalWins}W / {row.totalLosses}L</div>
                          </td>

                          {/* Total bets */}
                          <td className="px-3 py-3 text-right font-mono text-white text-xs">
                            {row.totalBets}
                          </td>

                          {/* Volume */}
                          <td className="px-3 py-3 text-right font-mono text-xs text-muted">
                            {fmtVol(row.totalWagered)} DORA
                          </td>

                          {/* Markets Created */}
                          <td className="px-3 py-3 text-right font-mono text-xs text-white">
                            {row.marketsCreated > 0 ? row.marketsCreated : <span className="text-muted">—</span>}
                          </td>

                          {/* Profit + share */}
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span className={`font-mono font-bold text-sm ${profitPositive ? "text-yes" : "text-no"}`}>
                                {profitPositive ? "+" : ""}{row.profit.toFixed(0)} DORA
                              </span>
                              {isCurrentUser && (
                                <button
                                  onClick={handleShareX}
                                  title="Share on X"
                                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#1d9bf0]/10 hover:bg-[#1d9bf0]/20 border border-[#1d9bf0]/30 text-[#1d9bf0] transition-colors shrink-0"
                                >
                                  <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                  </svg>
                                  Share
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>

        {/* Right Panel */}
        <div className="hidden xl:block w-56 shrink-0 py-6 sticky top-14 self-start h-[calc(100vh-3.5rem)] overflow-y-auto no-scrollbar">
          <RightPanel rounds={[]} />
        </div>

      </div>
    </div>
  );
}
