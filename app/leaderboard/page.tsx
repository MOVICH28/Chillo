"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/components/WalletProvider";
import { useLiveData } from "@/lib/useLiveData";

interface LeaderboardEntry {
  walletAddress: string;
  totalWins: number;
  totalLosses: number;
  totalBets: number;
  totalWagered: number;
  totalPayout: number;
  profit: number;
  winRate: number;
}

const RANK_STYLES: Record<number, { bg: string; text: string; label: string }> = {
  1: { bg: "bg-yellow-500/10 border-yellow-500/30", text: "text-yellow-400", label: "🥇" },
  2: { bg: "bg-gray-400/10 border-gray-400/30",   text: "text-gray-300",   label: "🥈" },
  3: { bg: "bg-orange-500/10 border-orange-500/30", text: "text-orange-400", label: "🥉" },
};

function shortAddress(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export default function LeaderboardPage() {
  const { publicKey, connected } = useWallet();
  const { data: liveData } = useLiveData();
  const solPrice = liveData.sol?.price ?? null;

  const [rows, setRows] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // username map: read from localStorage for any address we encounter
  const [usernameMap, setUsernameMap] = useState<Record<string, string>>({});

  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch("/api/leaderboard", { cache: "no-store" });
      if (!res.ok) return;
      const data: LeaderboardEntry[] = await res.json();
      setRows(data);
      setLastUpdated(new Date());

      // Read usernames from localStorage for all wallets we know about
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
  }, []);

  useEffect(() => {
    fetchLeaderboard();
    const id = setInterval(fetchLeaderboard, 30_000);
    return () => clearInterval(id);
  }, [fetchLeaderboard]);

  const usd = (sol: number) =>
    solPrice ? ` ($${(sol * solPrice).toFixed(2)})` : "";

  return (
    <div className="min-h-screen bg-base pt-14">
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🏆</span>
            <div>
              <h1 className="text-white font-bold text-2xl">Leaderboard</h1>
              <p className="text-muted text-xs mt-0.5">
                Top 50 traders by profit · refreshes every 30s
                {lastUpdated && (
                  <span className="ml-2 text-surface-3">
                    · updated {lastUpdated.toLocaleTimeString()}
                  </span>
                )}
              </p>
            </div>
          </div>
          <Link href="/" className="text-muted text-sm hover:text-white transition-colors">← Markets</Link>
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
                    <th className="text-right px-3 py-3">Wagered</th>
                    <th className="text-right px-4 py-3">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const rank = idx + 1;
                    const rankStyle = RANK_STYLES[rank];
                    const isCurrentUser = connected && publicKey === row.walletAddress;
                    const displayName = usernameMap[row.walletAddress] || shortAddress(row.walletAddress);
                    const profitPositive = row.profit >= 0;

                    return (
                      <tr
                        key={row.walletAddress}
                        className={[
                          "border-b border-surface-3/50 transition-colors",
                          isCurrentUser
                            ? "bg-brand/10 border-l-2 border-l-brand"
                            : rank <= 3
                            ? `${rankStyle.bg} hover:brightness-110`
                            : "hover:bg-surface-2/50",
                        ].join(" ")}
                      >
                        {/* Rank */}
                        <td className="px-4 py-3 text-center">
                          {rank <= 3 ? (
                            <span className="text-lg leading-none">{rankStyle.label}</span>
                          ) : (
                            <span className={`font-mono font-bold text-xs ${isCurrentUser ? "text-brand" : "text-muted"}`}>
                              #{rank}
                            </span>
                          )}
                        </td>

                        {/* Player */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {/* Mini avatar / initials */}
                            <div className="w-7 h-7 rounded-full overflow-hidden border border-surface-3 shrink-0 flex items-center justify-center bg-brand/20">
                              {(() => {
                                const storedAvatar = typeof window !== "undefined"
                                  ? localStorage.getItem(`avatar_${row.walletAddress}`)
                                  : null;
                                return storedAvatar ? (
                                  <img src={storedAvatar} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-brand font-bold text-[10px] select-none">
                                    {row.walletAddress.slice(0, 2).toUpperCase()}
                                  </span>
                                );
                              })()}
                            </div>
                            <div>
                              <span className={`font-semibold ${isCurrentUser ? "text-brand" : rank <= 3 ? rankStyle.text : "text-white"}`}>
                                {displayName}
                              </span>
                              {isCurrentUser && (
                                <span className="ml-1.5 text-[10px] text-brand/70">(you)</span>
                              )}
                              {usernameMap[row.walletAddress] && (
                                <div className="text-[10px] text-muted font-mono">
                                  {shortAddress(row.walletAddress)}
                                </div>
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

                        {/* Total wagered */}
                        <td className="px-3 py-3 text-right font-mono text-xs text-muted">
                          {row.totalWagered.toFixed(3)} SOL
                          {solPrice && <div className="text-[10px]">{usd(row.totalWagered).replace(" (", "").replace(")", "")}</div>}
                        </td>

                        {/* Profit */}
                        <td className="px-4 py-3 text-right">
                          <span className={`font-mono font-bold text-sm ${profitPositive ? "text-yes" : "text-no"}`}>
                            {profitPositive ? "+" : ""}{row.profit.toFixed(3)} SOL
                          </span>
                          {solPrice && (
                            <div className={`text-[10px] font-mono ${profitPositive ? "text-yes/70" : "text-no/70"}`}>
                              {profitPositive ? "+" : ""}${(row.profit * solPrice).toFixed(2)}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Current user not in top 50 */}
        {!loading && connected && publicKey && !rows.find(r => r.walletAddress === publicKey) && (
          <p className="text-center text-muted text-xs mt-4">
            Your wallet is not in the top 50 yet. Place more bets to climb the ranks!
          </p>
        )}

      </div>
    </div>
  );
}
