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

interface RecentMarket {
  id: string;
  question: string;
  creatorId: string | null;
  createdAt: string;
  creator: { username: string; avatarUrl: string | null } | null;
}

type FeedItem =
  | { kind: "bet";    data: LiveBet;      ts: number }
  | { kind: "market"; data: RecentMarket; ts: number };

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

function Avatar({ avatarUrl, username, size = "w-6 h-6" }: { avatarUrl: string | null; username: string; size?: string }) {
  return avatarUrl ? (
    <img src={avatarUrl} alt={username} className={`${size} rounded-full object-cover shrink-0`} />
  ) : (
    <div className={`${size} rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 ${avatarColor(username)}`}>
      {username.charAt(0).toUpperCase()}
    </div>
  );
}

interface Stats24h {
  volume24h: number;
  bets24h: number;
  activeMarkets: number;
}

export default function RightPanel({ rounds }: RightPanelProps) {
  void rounds;

  const [stats, setStats]           = useState<Stats24h>({ volume24h: 0, bets24h: 0, activeMarkets: 0 });
  const [liveBets, setLiveBets]     = useState<LiveBet[]>([]);
  const [recentMkts, setRecentMkts] = useState<RecentMarket[]>([]);

  useEffect(() => {
    function fetchStats() {
      fetch("/api/stats")
        .then(r => r.json())
        .then((d: Stats24h) => setStats(d))
        .catch(() => {});
    }
    fetchStats();
    const statsId = setInterval(fetchStats, 30_000);

    function fetchBets() {
      fetch("/api/bets")
        .then(r => r.json())
        .then(data => { if (Array.isArray(data)) setLiveBets(data); })
        .catch(() => {});
    }
    fetchBets();
    const betsId = setInterval(fetchBets, 5_000);
    window.addEventListener("trade-placed", fetchBets);

    function fetchMarkets() {
      fetch("/api/rounds/recent-created")
        .then(r => r.json())
        .then(data => { if (Array.isArray(data)) setRecentMkts(data); })
        .catch(() => {});
    }
    fetchMarkets();
    const mktsId = setInterval(fetchMarkets, 30_000);

    return () => {
      clearInterval(statsId);
      clearInterval(betsId);
      clearInterval(mktsId);
      window.removeEventListener("trade-placed", fetchBets);
    };
  }, []);

  // Merge bets and market creations into one time-sorted feed
  const feed: FeedItem[] = [
    ...liveBets.map(b => ({ kind: "bet"    as const, data: b, ts: new Date(b.createdAt).getTime() })),
    ...recentMkts.map(m => ({ kind: "market" as const, data: m, ts: new Date(m.createdAt).getTime() })),
  ].sort((a, b) => b.ts - a.ts).slice(0, 20);

  return (
    <aside className="w-full flex flex-col gap-3 pt-2">
      {/* Today's Stats */}
      <div className="bg-surface rounded-xl border border-surface-3 p-2">
        <p className="text-[9px] uppercase tracking-widest text-muted mb-2">24h Stats</p>
        <div className="space-y-2">
          <Stat label="Volume"  value={formatDora(stats.volume24h)} highlight />
          <Stat label="Markets" value={stats.activeMarkets.toString()} />
          <Stat label="Trades"  value={stats.bets24h.toString()} />
        </div>
      </div>

      {/* Live Feed */}
      <div className="bg-surface rounded-xl border border-surface-3 p-2 flex-1">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse-slow" />
          <p className="text-[9px] uppercase tracking-widest text-muted">Live Feed</p>
        </div>

        {feed.length === 0 ? (
          <p className="text-[10px] text-muted text-center py-3">No activity yet.</p>
        ) : (
          <div className="space-y-2.5">
            {feed.map(item =>
              item.kind === "bet"
                ? <BetItem key={`bet-${item.data.id}`} bet={item.data} />
                : <MarketItem key={`mkt-${item.data.id}`} market={item.data} />
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function BetItem({ bet }: { bet: LiveBet }) {
  const isBuy      = bet.type === "buy";
  const badgeClass = isBuy ? "bg-[#22c55e]/15 text-[#22c55e]" : "bg-red-500/15 text-red-400";
  const username   = bet.walletAddress;

  return (
    <div className="flex gap-2">
      <Link href={`/profile/${username}`} className="shrink-0">
        <Avatar avatarUrl={bet.avatarUrl} username={username} />
      </Link>
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex items-center justify-between gap-1">
          <Link href={`/profile/${username}`}
            className="text-[10px] font-mono text-white/60 truncate hover:text-brand transition-colors">
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
        <Link href={`/rounds/${bet.roundId}`}
          className="text-[10px] text-muted truncate hover:text-white/60 transition-colors">
          {bet.round?.question ?? bet.roundId}
        </Link>
      </div>
    </div>
  );
}

function MarketItem({ market }: { market: RecentMarket }) {
  const username = market.creator?.username ?? market.creatorId ?? "unknown";
  const avatarUrl = market.creator?.avatarUrl ?? null;

  return (
    <div className="flex gap-2">
      <Link href={`/profile/${username}`} className="shrink-0">
        <Avatar avatarUrl={avatarUrl} username={username} />
      </Link>
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex items-center justify-between gap-1">
          <Link href={`/profile/${username}`}
            className="text-[10px] font-mono text-white/60 truncate hover:text-brand transition-colors">
            {username}
          </Link>
          <span className="text-[10px] text-muted shrink-0">{timeAgo(market.createdAt)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand/15 text-brand">NEW</span>
          <span className="text-[10px] text-white/40">created a market</span>
        </div>
        <Link href={`/rounds/${market.id}`}
          className="text-[10px] text-muted truncate hover:text-white/60 transition-colors">
          {market.question}
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-1">
      <span className="text-[10px] text-muted whitespace-nowrap">{label}</span>
      <span className={`text-[10px] font-mono font-semibold shrink-0 ${highlight ? "text-brand" : "text-white"}`}>
        {value}
      </span>
    </div>
  );
}
