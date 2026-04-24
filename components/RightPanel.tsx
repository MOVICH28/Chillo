"use client";

import { Round } from "@/lib/types";
import { useEffect, useState } from "react";

interface RightPanelProps {
  rounds: Round[];
}

interface LiveBet {
  id: string;
  walletAddress: string;
  roundId: string;
  side: string;
  amount: number;
  createdAt: string;
  round: { question: string; status: string } | null;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
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
          <Stat label="Total Pool" value={`${totalPool.toFixed(1)} DORA`} highlight />
          <Stat label="Active Markets" value={openRounds.toString()} />
          <Stat label="Total Bets" value={totalBets.toString()} />
          <Stat label="Avg Pool" value={`${openRounds ? (totalPool / openRounds).toFixed(1) : "0"} DORA`} />
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
          <div className="space-y-2.5">
            {liveBets.map((bet) => {
              const isYes = bet.side === "yes";
              const isNo  = bet.side === "no";
              const sideClass = isYes
                ? "bg-yes/10 text-yes"
                : isNo
                ? "bg-no/10 text-no"
                : "bg-brand/10 text-brand";
              return (
              <div key={bet.id} className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-white/60 truncate max-w-[100px]">
                    {bet.walletAddress}
                  </span>
                  <span className="text-[10px] text-muted">{timeAgo(bet.createdAt)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${sideClass}`}>
                    {bet.side.toUpperCase()}
                  </span>
                  <span className="text-xs font-mono text-white">{parseFloat(String(bet.amount)).toFixed(2)} D</span>
                </div>
                <p className="text-[10px] text-muted truncate">{bet.round?.question ?? bet.roundId}</p>
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
