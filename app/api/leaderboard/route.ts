import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const bets = await prisma.bet.findMany({
      select: {
        walletAddress: true,
        userId: true,
        side: true,
        amount: true,
        payout: true,
        result: true,
        user: { select: { username: true, avatarUrl: true } },
      },
    });

    const map = new Map<string, {
      userId: string | null;
      totalWins: number; totalLosses: number; totalBets: number;
      totalWagered: number; totalPayout: number; username: string | null; avatarUrl: string | null;
    }>();

    for (const bet of bets) {
      const entry = map.get(bet.walletAddress) ?? {
        userId: bet.userId ?? null,
        totalWins: 0, totalLosses: 0, totalBets: 0,
        totalWagered: 0, totalPayout: 0,
        username: bet.user?.username ?? null,
        avatarUrl: bet.user?.avatarUrl ?? null,
      };

      entry.totalBets += 1;
      entry.totalWagered += bet.amount;

      if (bet.result !== null) {
        if (bet.result === bet.side) {
          entry.totalWins += 1;
          entry.totalPayout += bet.payout ?? 0;
        } else {
          entry.totalLosses += 1;
        }
      }

      map.set(bet.walletAddress, entry);
    }

    // Count markets created per user
    const userIds = Array.from(new Set(Array.from(map.values()).map(e => e.userId).filter((id): id is string => !!id)));
    const roundCounts = userIds.length
      ? await prisma.round.groupBy({ by: ["creatorId"], where: { creatorId: { in: userIds } }, _count: { id: true } })
      : [];
    const mktsMap = Object.fromEntries(roundCounts.map(r => [r.creatorId!, r._count.id]));

    const rows = Array.from(map.entries()).map(([walletAddress, s]) => {
      const resolved = s.totalWins + s.totalLosses;
      const winRate  = resolved > 0 ? (s.totalWins / resolved) * 100 : 0;
      const profit   = s.totalPayout - s.totalWagered;
      return {
        walletAddress,
        username: s.username,
        avatarUrl: s.avatarUrl,
        totalWins: s.totalWins,
        totalLosses: s.totalLosses,
        totalBets: s.totalBets,
        totalWagered: parseFloat(s.totalWagered.toFixed(4)),
        totalPayout:  parseFloat(s.totalPayout.toFixed(4)),
        profit:       parseFloat(profit.toFixed(4)),
        winRate:      parseFloat(winRate.toFixed(1)),
        marketsCreated: s.userId ? (mktsMap[s.userId] ?? 0) : 0,
      };
    });

    rows.sort((a, b) => b.profit - a.profit);
    return NextResponse.json(rows.slice(0, 50));
  } catch (err) {
    console.error("[GET /api/leaderboard]", err);
    return NextResponse.json({ error: "Failed to fetch leaderboard" }, { status: 500 });
  }
}
