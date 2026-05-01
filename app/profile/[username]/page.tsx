import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";
import RightPanel from "@/components/RightPanel";
import { Outcome } from "@/lib/types";
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

  // Fetch user (no bets relation — we use Trade model instead)
  let user: {
    id: string; username: string; doraBalance: number; avatarUrl: string | null;
    createdAt: Date; _count: { followers: number; following: number };
  } | null = null;

  try {
    user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true, username: true, doraBalance: true, avatarUrl: true, createdAt: true,
        _count: { select: { followers: true, following: true } },
      },
    });
  } catch (err) {
    console.error("[profile/username] user query failed:", err);
    notFound();
  }

  if (!user) notFound();

  let createdMarketsCount = 0;
  try {
    createdMarketsCount = await prisma.round.count({ where: { creatorId: user.id } });
  } catch (err) {
    console.error("[profile/username] markets count failed:", err);
  }

  // Fetch trades (LMSR system)
  let trades: Array<{
    id: string; outcome: string; type: string; totalCost: number;
    profitLoss: number | null; createdAt: Date; roundId: string;
    round: {
      id: string; question: string; roundNumber: number | null;
      status: string; winningOutcome: string | null; outcomes: unknown; endsAt: Date;
    } | null;
  }> = [];

  try {
    trades = await prisma.trade.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        round: {
          select: {
            id: true, question: true, roundNumber: true,
            status: true, winningOutcome: true, outcomes: true, endsAt: true,
          },
        },
      },
    });
  } catch (err) {
    console.error("[profile/username] trades query failed:", err);
  }

  // Derived stats from trades
  const buyTrades  = trades.filter(t => t.type === "buy");
  const sellTrades = trades.filter(t => t.type === "sell");
  const totalVolume   = buyTrades.reduce((s, t) => s + t.totalCost, 0);
  const totalReceived = sellTrades.reduce((s, t) => s + (-t.totalCost), 0); // sell totalCost is negative
  const netPnl        = sellTrades.reduce((s, t) => s + (t.profitLoss ?? 0), 0);
  const realizedTrades = sellTrades.filter(t => t.profitLoss !== null);
  const bestWin   = realizedTrades.length > 0 ? Math.max(0, ...realizedTrades.map(t => t.profitLoss!)) : 0;
  const worstLoss = realizedTrades.length > 0 ? Math.max(0, ...realizedTrades.map(t => -(t.profitLoss!))) : 0;
  const totalGained = realizedTrades.filter(t => (t.profitLoss ?? 0) > 0).reduce((s, t) => s + t.profitLoss!, 0);
  const totalLost   = realizedTrades.filter(t => (t.profitLoss ?? 0) < 0).reduce((s, t) => s + (-t.profitLoss!), 0);

  const joinDate = user.createdAt.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <div className="min-h-screen bg-base text-white">
      <Navbar rounds={[]} />

      <div className="flex flex-row gap-3 max-w-[1400px] mx-auto w-full px-2 mt-14">

        {/* Left Sidebar */}
        <div className="hidden lg:block w-40 shrink-0 overflow-y-auto py-6 no-scrollbar sticky top-14 self-start h-[calc(100vh-3.5rem)]">
          <Sidebar active="all" counts={{}} />
        </div>

        {/* Main content */}
        <main className="min-w-0 flex-1 py-6">

          <div className="flex items-center mb-6">
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
                    <p className={`text-xs font-mono mt-0.5 ${netPnl > 0 ? "text-[#22c55e]" : "text-red-400"}`}>
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
              { label: "Total Trades",    value: trades.length.toString() },
              { label: "Volume",          value: `${totalVolume.toFixed(0)} DORA` },
              { label: "Received",        value: `${totalReceived.toFixed(0)} DORA` },
              { label: "Net P&L",         value: `${netPnl >= 0 ? "+" : ""}${netPnl.toFixed(2)} DORA`,
                color: netPnl >= 0 ? "text-[#22c55e]" : "text-red-400" },
              { label: "Markets Created", value: createdMarketsCount.toString() },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-surface border border-surface-3 rounded-xl p-3">
                <p className="text-[10px] uppercase tracking-widest text-muted mb-1">{label}</p>
                <p className={`font-semibold font-mono ${color ?? "text-white"}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Trading History */}
          <div className="bg-surface border border-surface-3 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-surface-3">
              <h2 className="text-white font-semibold text-sm">Trading History</h2>
            </div>

            {/* Summary cards — only when there are sells with P&L */}
            {realizedTrades.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 border-b border-surface-3/50">
                {[
                  { label: "Total Gained", value: `+${totalGained.toFixed(2)}`, color: "text-[#22c55e]" },
                  { label: "Total Lost",   value: `-${totalLost.toFixed(2)}`,   color: "text-red-400"   },
                  { label: "Best Win",     value: `+${bestWin.toFixed(2)}`,     color: "text-[#22c55e]" },
                  { label: "Worst Loss",   value: `-${worstLoss.toFixed(2)}`,   color: "text-red-400"   },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
                    <p className="text-[10px] uppercase tracking-widest text-muted mb-1">{label}</p>
                    <p className={`font-mono font-semibold text-sm ${color}`}>{value} DORA</p>
                  </div>
                ))}
              </div>
            )}

            {trades.length === 0 ? (
              <div className="p-10 text-center text-muted text-sm">No trades yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-widest text-muted border-b border-surface-3">
                      <th className="text-left px-3 py-2 whitespace-nowrap">Date</th>
                      <th className="text-left px-3 py-2 w-full">Market</th>
                      <th className="text-left px-3 py-2">Outcome</th>
                      <th className="text-center px-3 py-2">Type</th>
                      <th className="text-right px-3 py-2">Amount</th>
                      <th className="text-right px-3 py-2">P&amp;L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map(trade => {
                      const isBuy       = trade.type === "buy";
                      const doraAmt     = isBuy ? trade.totalCost : -trade.totalCost;
                      const pl          = trade.profitLoss;
                      const plColor     = pl === null ? "text-muted" : pl >= 0 ? "text-[#22c55e]" : "text-red-400";
                      const c           = OUTCOME_COLORS[trade.outcome];
                      const outcomes    = trade.round?.outcomes as Outcome[] | null;
                      const outcomeLabel = outcomes?.find(o => o.id === trade.outcome)?.label;

                      return (
                        <tr key={trade.id} className="border-b border-surface-3/50 hover:bg-white/[0.02] transition-colors">
                          <td className="px-3 py-2.5 text-muted whitespace-nowrap text-[11px]">
                            {new Date(trade.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </td>
                          <td className="px-3 py-2.5 max-w-0 w-full">
                            <div className="truncate text-white/60 text-xs">
                              {trade.round?.roundNumber != null && (
                                <span className="text-muted font-mono mr-1">#{trade.round.roundNumber} ·</span>
                              )}
                              {trade.round ? (
                                <Link href={`/rounds/${trade.round.id}`} className="hover:text-[#22c55e] hover:underline transition-colors">
                                  {trade.round.question}
                                </Link>
                              ) : (
                                <span className="text-muted">{trade.roundId}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {c ? (
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${c.bg} ${c.text} border ${c.border}`}>
                                <span className="font-bold">{trade.outcome}</span>
                                {outcomeLabel && <span className="opacity-70 max-w-[100px] truncate">· {outcomeLabel}</span>}
                              </span>
                            ) : (
                              <span className="text-white/50 font-mono">{trade.outcome}</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              isBuy
                                ? "bg-[#22c55e]/15 text-[#22c55e]"
                                : "bg-red-500/15 text-red-400"
                            }`}>
                              {isBuy ? "BUY" : "SELL"}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-white/80">
                            {doraAmt.toFixed(2)}
                          </td>
                          <td className={`px-3 py-2.5 text-right font-mono font-semibold ${plColor}`}>
                            {pl === null ? "—" : `${pl >= 0 ? "+" : ""}${pl.toFixed(2)}`}
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
