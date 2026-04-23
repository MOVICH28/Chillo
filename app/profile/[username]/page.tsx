import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { Outcome } from "@/lib/types";
import TradingHistoryChart from "@/components/TradingHistoryChart";

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
      createdAt: true,
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

  // Fetch rounds for the bets
  const roundIds = Array.from(new Set(user.bets.map(b => b.roundId)));
  const rounds = roundIds.length > 0
    ? await prisma.round.findMany({
        where: { id: { in: roundIds } },
        select: { id: true, question: true, status: true, winningOutcome: true, outcomes: true },
      })
    : [];
  const roundMap = new Map(rounds.map(r => [r.id, r]));

  type BetRow = typeof user.bets[number] & {
    round: { question: string; status: string; winningOutcome: string | null; outcomes: Outcome[] | null } | null;
  };

  const bets: BetRow[] = user.bets.map(b => {
    const r = roundMap.get(b.roundId);
    return {
      ...b,
      round: r
        ? { question: r.question, status: r.status, winningOutcome: r.winningOutcome,
            outcomes: (r.outcomes as unknown as Outcome[] | null) }
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
            <div className="w-16 h-16 rounded-full bg-brand/20 border-2 border-brand/30 flex items-center justify-center text-brand font-bold text-2xl select-none shrink-0">
              {user.username.slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-white font-bold text-xl">{user.username}</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-brand/10 border border-brand/20 text-brand font-medium">DORA</span>
              </div>
              <p className="text-muted text-xs">Member since {joinDate}</p>
            </div>
            <div className="shrink-0 text-right">
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
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total Bets",    value: bets.length.toString() },
            { label: "Total Wagered", value: `${wagered.toFixed(0)} DORA` },
            { label: "Wins / Losses", value: `${wins.length} / ${resolved.length - wins.length}` },
            { label: "Win Rate",      value: `${winRate}%` },
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

        {/* Bet history */}
        <div className="bg-surface border border-surface-3 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-brand" />
            <h2 className="text-white font-semibold">Recent Bets</h2>
          </div>
          {bets.length === 0 ? (
            <div className="p-10 text-center text-muted text-sm">No bets yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest text-muted border-b border-surface-3">
                    <th className="text-left px-4 py-2.5">Market</th>
                    <th className="text-center px-3 py-2.5">Bet</th>
                    <th className="text-right px-3 py-2.5">Amount</th>
                    <th className="text-center px-3 py-2.5">Result</th>
                    <th className="text-right px-4 py-2.5">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {bets.map(bet => {
                    const isWin  = bet.result !== null && bet.result !== "refund" && bet.result === bet.side;
                    const isLoss = bet.result !== null && bet.result !== "refund" && bet.result !== bet.side;
                    const resultColor = isWin ? "text-green-400" : isLoss ? "text-red-400" : "text-muted";
                    const resultLabel = isWin ? "WIN" : isLoss ? "LOSS" : bet.result === "refund" ? "REFUND" : "Pending";
                    const c = OUTCOME_COLORS[bet.side];
                    const outcomeLabel = bet.round?.outcomes?.find(o => o.id === bet.side)?.label;

                    return (
                      <tr key={bet.id} className="border-b border-surface-3/50 hover:bg-surface-2/50 transition-colors">
                        <td className="px-4 py-3 text-muted text-xs max-w-[200px] truncate">
                          {bet.round?.question ?? "—"}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {c && outcomeLabel ? (
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${c.bg} ${c.text} border ${c.border}`}>
                              <span className="font-bold">{bet.side}</span>
                              <span className="opacity-70 truncate">· {outcomeLabel}</span>
                            </span>
                          ) : (
                            <span className="text-xs text-white/50 font-mono">{bet.side}</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-white text-xs">{bet.amount.toFixed(2)} DORA</td>
                        <td className={`px-3 py-3 text-center text-xs font-semibold ${resultColor}`}>{resultLabel}</td>
                        <td className="px-4 py-3 text-right text-muted text-xs">
                          {new Date(bet.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
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
