import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Outcome } from "@/lib/types";

export const dynamic = "force-dynamic";

const BASE_POOL_SEED = 20;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [round, pool, bets] = await Promise.all([
    prisma.round.findUnique({ where: { id } }),
    prisma.roundPool.findUnique({ where: { roundId: id } }),
    prisma.bet.findMany({
      where: { roundId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
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
    yesPool: yp,
    noPool:  np,
    totalPool: tp,
    realPool,
    recentBets: bets.map(b => ({
      id:            b.id,
      walletAddress: b.walletAddress,
      side:          b.side,
      amount:        b.amount,
      odds:          b.odds,
      createdAt:     b.createdAt.toISOString(),
    })),
  });
}
