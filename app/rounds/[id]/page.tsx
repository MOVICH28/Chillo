import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Outcome } from "@/lib/types";
import RoundDetail from "./RoundDetail";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RoundDetailPage({ params }: PageProps) {
  const { id } = await params;

  const [round, pool] = await Promise.all([
    prisma.round.findUnique({ where: { id } }),
    prisma.roundPool.findUnique({ where: { roundId: id } }),
  ]);

  if (!round) notFound();

  const yp = pool?.yesPool   ?? round.yesPool;
  const np = pool?.noPool    ?? round.noPool;
  const tp = pool?.totalPool ?? round.totalPool;

  const isRange  = round.outcomes !== null;
  const realPool = isRange ? Math.max(0, tp) : Math.max(0, tp - 20);

  const serialized = {
    id:             round.id,
    question:       round.question,
    category:       round.category,
    status:         round.status as "open" | "closed" | "resolved",
    endsAt:         round.endsAt.toISOString(),
    createdAt:      round.createdAt.toISOString(),
    resolvedAt:     round.resolvedAt?.toISOString()      ?? null,
    bettingClosesAt: round.bettingClosesAt?.toISOString() ?? null,
    targetToken:    round.targetToken,
    targetPrice:    round.targetPrice,
    tokenList:      round.tokenList,
    winner:         round.winner,
    winningOutcome: round.winningOutcome,
    outcomes:       (round.outcomes as unknown as Outcome[] | null) ?? null,
    yesPool:  yp,
    noPool:   np,
    totalPool: tp,
    realPool,
  };

  return <RoundDetail initialRound={serialized} />;
}
