"use client";

import Link from "next/link";
import { Round } from "@/lib/types";
import { useEffect, useState } from "react";

interface RightPanelProps {
  rounds: Round[];
}

interface LiveBet {
  id: string;
  walletAddress: string;
  avatarUrl: string | null;
  roundId: string;
  side: string;
  type: string;
  amount: number;
  profitLoss: number | null;
  createdAt: string;
  round: { question: string; status: string; targetToken: string | null } | null;
}

const TOKEN_LOGOS: Record<string, string> = {
  bitcoin: "https://assets.coingecko.com/coins/images/1/small/bitcoin.png",
  solana:  "https://assets.coingecko.com/coins/images/4128/small/solana.png",
};

function formatDora(amount: number): string {
  const n = Math.round(amount * 100) / 100;
  return n % 1 === 0 ? n.toLocaleString() : n.toFixed(2);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

const AVATAR_COLORS = [
  "bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-green-500",
  "bg-sky-500", "bg-purple-500", "bg-pink-500", "bg-brand",
];

function avatarColor(username: string): string {
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash = username.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function RightPanel({ rounds }: RightPanelProps) {
  const totalPool = rounds.reduce((s, r) => s + r.totalPool, 0);
  const openRounds = rounds.filter((r) => r.status === "open").length;

  const [liveBets, setLiveBets] = useState<LiveBet[]>([]);
  const [totalBets, setTotalBets] = useState(0);

  useEffect(() => {
    function fetchBets() {
      fetch("/api/bets")
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setLiveBets(data);
            setTotalBets(data.length);
          }
        })
        .catch(() => {});
    }
    fetchBets();
    const id = setInterval(fetchBets, 5_000);
    window.addEventListener("trade-placed", fetchBets);
    return () => {
      clearInterval(id);
      window.removeEventListener("trade-placed", fetchBets);
    };
  }, []);

  return (
    <aside className="w-64 shrink-0 flex flex-col gap-4 pt-2">
      {/* Today's Stats */}
      <div className="bg-surface rounded-xl border border-surface-3 p-4">
        <p className="text-[10px] uppercase tracking-widest text-muted mb-3">Today&apos;s Stats</p>
        <div className="space-y-2.5">
          <Stat label="Total Pool" value={`${formatDora(totalPool)} DORA`} highlight />
          <Stat label="Active Markets" value={openRounds.toString()} />
          <Stat label="Total Bets" value={totalBets.toString()} />
          <Stat label="Avg Pool" value={`${openRounds ? formatDora(totalPool / openRounds) : "0"} DORA`} />
        </div>
      </div>

      {/* Live Bets Feed */}
      <div className="bg-surface rounded-xl border border-surface-3 p-4 flex-1">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse-slow" />
          <p className="text-[10px] uppercase tracking-widest text-muted">Live Bets</p>
        </div>

        {liveBets.length === 0 ? (
          <p className="text-xs text-muted text-center py-4">No bets yet. Be first!</p>
        ) : (
          <div className="space-y-3">
            {liveBets.map((bet) => {
              const isBuy = bet.type === "buy";
              const badgeClass = isBuy
                ? "bg-[#22c55e]/15 text-[#22c55e]"
                : "bg-red-500/15 text-red-400";
              const username = bet.walletAddress;
              const initial = username.charAt(0).toUpperCase();

              return (
                <div key={bet.id} className="flex gap-2">
                  {/* Avatar */}
                  <Link href={`/profile/${username}`} className="shrink-0">
                    {bet.avatarUrl ? (
                      <img
                        src={bet.avatarUrl}
                        alt={username}
                        className="w-6 h-6 rounded-full object-cover"
                      />
                    ) : (
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 ${avatarColor(username)}`}>
                        {initial}
                      </div>
                    )}
                  </Link>

                  {/* Content */}
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <div className="flex items-center justify-between gap-1">
                      <Link
                        href={`/profile/${username}`}
                        className="text-[10px] font-mono text-white/60 truncate hover:text-brand transition-colors cursor-pointer"
                      >
                        {username}
                      </Link>
                      <span className="text-[10px] text-muted shrink-0">{timeAgo(bet.createdAt)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${badgeClass}`}>
                          {isBuy ? "BUY" : "SELL"}
                        </span>
                        <span className="text-[10px] font-mono text-white/50">{bet.side.toUpperCase()}</span>
                        {bet.round?.targetToken && TOKEN_LOGOS[bet.round.targetToken] && (
                          <img src={TOKEN_LOGOS[bet.round.targetToken]} alt={bet.round.targetToken} className="w-3.5 h-3.5 rounded-full" />
                        )}
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-xs font-mono text-white">{formatDora(bet.amount)} DORA</span>
                        {!isBuy && bet.profitLoss !== null && (
                          <span className={`text-[10px] font-mono ${bet.profitLoss >= 0 ? "text-[#22c55e]" : "text-red-400"}`}>
                            {bet.profitLoss >= 0 ? "+" : ""}{formatDora(bet.profitLoss)} DORA
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-[10px] text-muted truncate">{bet.round?.question ?? bet.roundId}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted">{label}</span>
      <span className={`text-xs font-mono font-semibold ${highlight ? "text-brand" : "text-white"}`}>
        {value}
      </span>
    </div>
  );
}
