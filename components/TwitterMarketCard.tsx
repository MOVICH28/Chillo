"use client";

import Link from "next/link";
import { Round, Outcome } from "@/lib/types";

function timeAgo(dateStr: string): string {
  const mins = Math.round((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins === 0) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatCountdown(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return "Ended";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m ${s % 60}s`;
}

const OUTCOME_COLORS: Record<string, string> = {
  A: "#f87171", B: "#fb923c", C: "#facc15",
  D: "#4ade80", E: "#38bdf8", F: "#c084fc",
};

interface Props {
  round: Round;
}

export default function TwitterMarketCard({ round }: Props) {
  const outcomes = (round.outcomes ?? []) as Outcome[];
  const username = round.twitterUsername ?? "unknown";
  const qType    = round.twitterQuestion ?? "posts_count";
  const isResolved = round.status === "resolved";

  return (
    <Link href={`/rounds/${round.id}`} className="block group">
      <div className="rounded-xl border border-white/8 bg-[#0d0f14] hover:border-white/15 transition-colors overflow-hidden">

        {/* Header strip */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          {/* Twitter bird icon */}
          <div className="w-10 h-10 rounded-full bg-[#1d9bf0]/15 border border-[#1d9bf0]/30 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-[#1d9bf0]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.858L1.808 2.25h6.946l4.258 5.63 5.232-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-white font-semibold text-sm truncate">@{username}</span>
              <span className="text-[10px] px-1.5 py-px rounded bg-[#1d9bf0]/10 text-[#1d9bf0] border border-[#1d9bf0]/20 shrink-0">
                Twitter
              </span>
            </div>
            <p className="text-white/60 text-xs truncate">{round.question}</p>
          </div>

          {isResolved && round.winningOutcome ? (
            <span className="shrink-0 text-[10px] px-2 py-1 rounded-full font-semibold"
              style={{ background: `${OUTCOME_COLORS[round.winningOutcome]}20`, color: OUTCOME_COLORS[round.winningOutcome] }}>
              {round.winningOutcome} won
            </span>
          ) : (
            <div className="shrink-0 flex flex-col items-end">
              <span className="text-[10px] text-white/30 uppercase tracking-wider">ends</span>
              <span className="text-xs font-mono text-white/60">{formatCountdown(round.endsAt)}</span>
            </div>
          )}
        </div>

        {/* Question type badge */}
        <div className="px-4 pb-3">
          <span className="inline-flex items-center gap-1 text-[10px] text-white/40 bg-white/5 px-2 py-0.5 rounded">
            {qType === "posts_count"
              ? `📊 Posts count · ${round.twitterPeriodHours ?? 24}h window`
              : "⏱ Next post time"}
          </span>
        </div>

        {/* Outcomes grid */}
        {outcomes.length > 0 && (
          <div className="px-4 pb-4 grid grid-cols-2 gap-1.5">
            {outcomes.map(o => {
              const color = OUTCOME_COLORS[o.id] ?? "#888";
              const isWinner = isResolved && round.winningOutcome === o.id;
              return (
                <div key={o.id}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] transition-colors"
                  style={{
                    background:   isWinner ? `${color}18` : "rgba(255,255,255,0.03)",
                    borderColor:  isWinner ? `${color}50` : "rgba(255,255,255,0.07)",
                  }}>
                  <span className="font-bold shrink-0" style={{ color }}>{o.id}</span>
                  <span className="text-white/60 truncate">{o.label}</span>
                  {isWinner && <span className="ml-auto text-[10px]" style={{ color }}>✓</span>}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="px-4 pb-3 flex items-center justify-between text-[10px] text-white/25 border-t border-white/5 pt-2">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1d9bf0] animate-pulse" />
            Monitoring @{username}
          </span>
          <span>{timeAgo(round.createdAt)}</span>
        </div>
      </div>
    </Link>
  );
}
