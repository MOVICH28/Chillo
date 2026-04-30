import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Outcome } from "@/lib/types";

export const dynamic = "force-dynamic";

const BASE_POOL_SEED = 20;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [round, pool, trades, volumeAgg] = await Promise.all([
    prisma.round.findUnique({ where: { id }, include: { creator: { select: { username: true, avatarUrl: true } } } }),
    prisma.roundPool.findUnique({ where: { roundId: id } }),
    prisma.trade.findMany({
      where: { roundId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { user: { select: { username: true, avatarUrl: true } } },
    }),
    prisma.trade.aggregate({ where: { roundId: id, type: "buy" }, _sum: { totalCost: true } }),
  ]);

  if (!round) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const yp = pool?.yesPool   ?? round.yesPool;
  const np = pool?.noPool    ?? round.noPool;
  const tp = pool?.totalPool ?? round.totalPool;

  const isRange  = round.outcomes !== null;
  const realPool = isRange ? Math.max(0, tp) : Math.max(0, tp - BASE_POOL_SEED);

  return NextResponse.json({
    ...round,
    endsAt:          round.endsAt.toISOString(),
    createdAt:       round.createdAt.toISOString(),
    resolvedAt:      round.resolvedAt?.toISOString()      ?? null,
    bettingClosesAt: round.bettingClosesAt?.toISOString() ?? null,
    outcomes:        (round.outcomes as unknown as Outcome[] | null) ?? null,
    shares:          (round.shares as Record<string, number> | null) ?? null,
    lmsrB:           round.lmsrB,
    yesPool: yp,
    noPool:  np,
    totalPool: tp,
    realPool,
    creatorUsername:  round.creator?.username  ?? null,
    creatorAvatarUrl: round.creator?.avatarUrl ?? null,
    totalVolume: volumeAgg._sum.totalCost ?? 0,
    creator: undefined,
    recentTrades: trades.map(t => ({
      id:          t.id,
      username:    t.user?.username ?? null,
      avatarUrl:   t.user?.avatarUrl ?? null,
      outcome:     t.outcome,
      type:        t.type,
      totalCost:   t.totalCost,
      profitLoss:  t.profitLoss ?? null,
      createdAt:   t.createdAt.toISOString(),
    })),
  });
}
