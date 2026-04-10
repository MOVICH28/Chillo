"use client";

import { Round, Bet } from "@/lib/types";
import { useMemo } from "react";

interface RightPanelProps {
  rounds: Round[];
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
  const totalBets = rounds.reduce((s, r) => s + (r.bets?.length ?? 0), 0);
  const openRounds = rounds.filter((r) => r.status === "open").length;

  const liveBets = useMemo(() => {
    const all: (Bet & { question: string })[] = [];
    for (const r of rounds) {
      for (const b of r.bets ?? []) {
        all.push({ ...b, question: r.question });
      }
    }
    return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10);
  }, [rounds]);

  return (
    <aside className="w-64 shrink-0 flex flex-col gap-4 pt-2">
      {/* Today's Stats */}
      <div className="bg-surface rounded-xl border border-surface-3 p-4">
        <p className="text-[10px] uppercase tracking-widest text-muted mb-3">Today&apos;s Stats</p>
        <div className="space-y-2.5">
          <Stat label="Total Pool" value={`${totalPool.toFixed(1)} SOL`} highlight />
          <Stat label="Active Markets" value={openRounds.toString()} />
          <Stat label="Total Bets" value={totalBets.toString()} />
          <Stat label="Avg Pool" value={`${openRounds ? (totalPool / openRounds).toFixed(1) : "0"} SOL`} />
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
            {liveBets.map((bet) => (
              <div key={bet.id} className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-muted">
                    {bet.walletAddress.slice(0, 4)}...{bet.walletAddress.slice(-4)}
                  </span>
                  <span className="text-[10px] text-muted">{timeAgo(bet.createdAt)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                      bet.side === "yes"
                        ? "bg-yes/10 text-yes"
                        : "bg-no/10 text-no"
                    }`}
                  >
                    {bet.side.toUpperCase()}
                  </span>
                  <span className="text-xs font-mono text-white">{bet.amount} SOL</span>
                </div>
                <p className="text-[10px] text-muted truncate">{bet.question}</p>
              </div>
            ))}
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
