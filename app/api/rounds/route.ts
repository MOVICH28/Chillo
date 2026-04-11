import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function computeOdds(yesPool: number, noPool: number, totalPool: number) {
  if (totalPool === 0) {
    return { yesOdds: 2.0, noOdds: 2.0, yesPct: 50, noPct: 50 };
  }
  return {
    yesOdds: parseFloat(Math.max(1.05, totalPool / Math.max(yesPool, 0.001)).toFixed(2)),
    noOdds:  parseFloat(Math.max(1.05, totalPool / Math.max(noPool,  0.001)).toFixed(2)),
    yesPct:  parseFloat(((yesPool / totalPool) * 100).toFixed(1)),
    noPct:   parseFloat(((noPool  / totalPool) * 100).toFixed(1)),
  };
}

export async function GET() {
  const [rounds, pools] = await Promise.all([
    prisma.round.findMany({
      where: { status: { in: ["open", "closed"] } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.roundPool.findMany(),
  ]);

  const poolMap = new Map(pools.map((p) => [p.roundId, p]));

  const result = rounds.map((round) => {
    const live = poolMap.get(round.id);
    const yp = live ? live.yesPool : round.yesPool;
    const np = live ? live.noPool  : round.noPool;
    const tp = live ? live.totalPool : round.totalPool;
    return {
      ...round,
      endsAt:     round.endsAt.toISOString(),
      createdAt:  round.createdAt.toISOString(),
      resolvedAt: round.resolvedAt?.toISOString() ?? null,
      yesPool: yp,
      noPool:  np,
      totalPool: tp,
      ...computeOdds(yp, np, tp),
      bets: [],
    };
  });

  return NextResponse.json(result);
}
