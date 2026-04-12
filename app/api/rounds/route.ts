import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Each round is seeded with 10 SOL per side as platform liquidity.
// realPool = actual user bets only (excludes seed liquidity).
const BASE_POOL_SEED = 20; // 10 YES + 10 NO

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
      where: { status: { in: ["open", "closed", "resolved"] } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.roundPool.findMany(),
  ]);

  const poolMap = new Map(pools.map((p) => [p.roundId, p]));

  const mapped = rounds.map((round) => {
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
      realPool: Math.max(0, tp - BASE_POOL_SEED),
      ...computeOdds(yp, np, tp),
      bets: [],
    };
  });

  // Open/closed rounds first (sorted by createdAt desc already),
  // then resolved rounds sorted by resolvedAt desc.
  const open     = mapped.filter((r) => r.status !== "resolved");
  const resolved = mapped
    .filter((r) => r.status === "resolved")
    .sort((a, b) => {
      const ta = a.resolvedAt ? new Date(a.resolvedAt).getTime() : 0;
      const tb = b.resolvedAt ? new Date(b.resolvedAt).getTime() : 0;
      return tb - ta;
    });

  return NextResponse.json([...open, ...resolved]);
}
