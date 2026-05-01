import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { Outcome } from "@/lib/types";
import TradingHistoryChart from "@/components/TradingHistoryChart";
import Avatar from "@/components/Avatar";
import FollowButton from "@/components/FollowButton";

export const dynamic = "force-dynamic";

const OUTCOME_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  A: { text: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/30" },
  B: { text: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30" },
  C: { text: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30" },
  D: { text: "text-green-400",  bg: "bg-green-500/10",  border: "border-green-500/30" },
  E: { text: "text-sky-400",    bg: "bg-sky-500/10",    border: "border-sky-500/30" },
  F: { text: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/30" },
};

export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;

  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      doraBalance: true,
      avatarUrl: true,
      createdAt: true,
      _count: { select: { followers: true, following: true } },
      bets: {
        where: { currency: "DORA" },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true, side: true, amount: true, odds: true,
          result: true, payout: true, createdAt: true, roundId: true,
        },
      },
    },
  });

  if (!user) notFound();

  const createdMarketsCount = await prisma.round.count({ where: { creatorId: user.id } });

  // Fetch rounds for the bets
  const roundIds = Array.from(new Set(user.bets.map(b => b.roundId)));
  const rounds = roundIds.length > 0
    ? await prisma.round.findMany({
        where: { id: { in: roundIds } },
        select: { id: true, question: true, status: true, winningOutcome: true, outcomes: true, roundNumber: true },
      })
    : [];
  const roundMap = new Map(rounds.map(r => [r.id, r]));

  type BetRow = typeof user.bets[number] & {
    round: { id: string; question: string; status: string; winningOutcome: string | null; outcomes: Outcome[] | null; roundNumber: number | null } | null;
  };

  const bets: BetRow[] = user.bets.map(b => {
    const r = roundMap.get(b.roundId);
    return {
      ...b,
      round: r
        ? { id: r.id, question: r.question, status: r.status, winningOutcome: r.winningOutcome,
            outcomes: (r.outcomes as unknown as Outcome[] | null), roundNumber: r.roundNumber ?? null }
        : null,
    };
  });

  const resolved = bets.filter(b => b.result !== null && b.result !== "refund");
  const wins     = resolved.filter(b => b.result === b.side);
  const wagered  = bets.reduce((s, b) => s + b.amount, 0);
  const winRate  = resolved.length > 0 ? ((wins.length / resolved.length) * 100).toFixed(0) : "0";
  const netPnl   = bets.reduce((s, b) => {
    if (b.result === "refund") return s;
    if (b.result !== null && b.result === b.side) return s + ((b.payout ?? 0) - b.amount);
    if (b.result !== null) return s - b.amount;
    return s;
  }, 0);

  const joinDate = user.createdAt.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <div className="min-h-screen bg-base pt-16">
      <Navbar rounds={[]} />
      <div className="max-w-3xl mx-auto px-4 py-8">

        <div className="flex items-center justify-between mb-6">
          <Link href="/" className="text-muted text-sm hover:text-white transition-colors">← Markets</Link>
        </div>

        {/* Profile card */}
        <div className="bg-surface border border-surface-3 rounded-xl p-5 mb-6">
          <div className="flex flex-wrap items-center gap-5">
            <Avatar username={user.username} avatarUrl={user.avatarUrl} size={64} className="shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-white font-bold text-xl">{user.username}</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-brand/10 border border-brand/20 text-brand font-medium">DORA</span>
              </div>
              <p className="text-muted text-xs mb-1.5">Member since {joinDate}</p>
              <p className="text-sm text-white/60">
                <span className="text-white font-semibold">{user._count.followers}</span> followers
                <span className="text-white/20 mx-1.5">·</span>
                <span className="text-white font-semibold">{user._count.following}</span> following
                <span className="text-white/20 mx-1.5">·</span>
                <span className="text-white font-semibold">{createdMarketsCount}</span> created
              </p>
            </div>
            <div className="shrink-0 text-right flex flex-col items-end gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted mb-1">DORA Balance</p>
                <p className="text-brand font-mono font-bold text-2xl">
                  {Math.floor(user.doraBalance).toLocaleString("en-US")}
                  <span className="text-sm font-normal ml-1">DORA</span>
                </p>
                {netPnl !== 0 && (
                  <p className={`text-xs font-mono mt-0.5 ${netPnl > 0 ? "text-green-400" : "text-red-400"}`}>
                    {netPnl > 0 ? "+" : ""}{netPnl.toFixed(2)} P&L
                  </p>
                )}
              </div>
              <FollowButton targetUserId={user.id} targetUsername={user.username} />
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { label: "Total Bets",       value: bets.length.toString() },
            { label: "Total Wagered",    value: `${wagered.toFixed(0)} DORA` },
            { label: "Wins / Losses",    value: `${wins.length} / ${resolved.length - wins.length}` },
            { label: "Win Rate",         value: `${winRate}%` },
            { label: "Created Markets",  value: createdMarketsCount.toString() },
          ].map(({ label, value }) => (
            <div key={label} className="bg-surface border border-surface-3 rounded-xl p-3">
              <p className="text-[10px] uppercase tracking-widest text-muted mb-1">{label}</p>
              <p className="text-white font-semibold font-mono">{value}</p>
            </div>
          ))}
        </div>

        {/* Trading History Chart */}
        <TradingHistoryChart bets={bets.map(b => ({
          id: b.id,
          side: b.side,
          amount: b.amount,
          result: b.result,
          payout: b.payout,
          createdAt: new Date(b.createdAt).toISOString(),
          roundQuestion: b.round?.question ?? null,
        }))} />

        {/* Trading History */}
        <div className="bg-surface border border-surface-3 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-3">
            <h2 className="text-white font-semibold text-sm">Trading History</h2>
          </div>
          {bets.length === 0 ? (
            <div className="p-10 text-center text-muted text-sm">No trades yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest text-muted border-b border-surface-3">
                    <th className="text-left px-3 py-2 whitespace-nowrap">Date</th>
                    <th className="text-left px-3 py-2 w-full">Market</th>
                    <th className="text-left px-3 py-2">Outcome</th>
                    <th className="text-right px-3 py-2">Stake</th>
                    <th className="text-center px-3 py-2">Result</th>
                    <th className="text-right px-3 py-2">P&amp;L</th>
                  </tr>
                </thead>
                <tbody>
                  {bets.map(bet => {
                    const isRefund  = bet.result === "refund";
                    const isWin     = !isRefund && bet.result !== null && bet.result === bet.side;
                    const isLoss    = !isRefund && bet.result !== null && bet.result !== bet.side;
                    const isPending = bet.result === null;
                    const profit    = isWin ? (bet.payout ?? 0) - bet.amount : isLoss ? -bet.amount : null;
                    const resLabel  = isWin ? "Won" : isLoss ? "Lost" : isRefund ? "Refund" : "Pending";
                    const resColor  = isWin ? "text-[#22c55e]" : isLoss ? "text-red-400" : isPending ? "text-yellow-400" : "text-muted";
                    const plColor   = profit === null ? "text-muted" : profit >= 0 ? "text-[#22c55e]" : "text-red-400";
                    const c = OUTCOME_COLORS[bet.side];
                    const outcomeLabel = bet.round?.outcomes?.find(o => o.id === bet.side)?.label;
                    return (
                      <tr key={bet.id} className="border-b border-surface-3/50 hover:bg-white/[0.02] transition-colors">
                        <td className="px-3 py-2.5 text-muted whitespace-nowrap text-[11px]">
                          {new Date(bet.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="px-3 py-2.5 max-w-0 w-full">
                          <div className="truncate text-white/60 text-xs">
                            {bet.round?.roundNumber != null && (
                              <span className="text-muted font-mono mr-1">#{bet.round.roundNumber} ·</span>
                            )}
                            {bet.round ? (
                              <Link href={`/rounds/${bet.round.id}`} className="hover:text-[#22c55e] hover:underline transition-colors">
                                {bet.round.question}
                              </Link>
                            ) : (
                              <span>{bet.roundId}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {c ? (
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${c.bg} ${c.text} border ${c.border}`}>
                              <span className="font-bold">{bet.side}</span>
                              {outcomeLabel && <span className="opacity-70 max-w-[100px] truncate">· {outcomeLabel}</span>}
                            </span>
                          ) : (
                            <span className="text-white/50 font-mono">{bet.side}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-white/80">{bet.amount.toFixed(2)}</td>
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
          )}
        </div>

      </div>
    </div>
  );
}
