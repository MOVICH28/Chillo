import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAllPrices } from "@/lib/lmsr";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const round = await prisma.round.findUnique({ where: { id } });
  if (!round) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const outcomes = (round.outcomes as { id: string }[] | null) ?? [];
  const outcomeIds = outcomes.map(o => o.id);
  const b = round.lmsrB;

  const trades = await prisma.trade.findMany({
    where: { roundId: id },
    orderBy: { createdAt: "asc" },
    select: { outcome: true, shares: true, type: true, createdAt: true },
  });

  // Replay trades to build probability timeline
  const runningShares: Record<string, number> = Object.fromEntries(outcomeIds.map(o => [o, 0]));
  const roundStart = round.createdAt.getTime();

  const points = trades.map(t => {
    const delta = t.type === "sell" ? -t.shares : t.shares;
    runningShares[t.outcome] = (runningShares[t.outcome] ?? 0) + delta;
    const probs = getAllPrices({ ...runningShares }, b, outcomeIds);
    return {
      minutesSinceStart: Math.round((t.createdAt.getTime() - roundStart) / 60_000),
      probabilities: Object.fromEntries(
        Object.entries(probs).map(([k, v]) => [k, Math.round(v * 1000) / 10])
      ),
    };
  });

  // Always include t=0 starting point (equal probs)
  const initialProbs = getAllPrices(Object.fromEntries(outcomeIds.map(o => [o, 0])), b, outcomeIds);
  const initial = {
    minutesSinceStart: 0,
    probabilities: Object.fromEntries(
      Object.entries(initialProbs).map(([k, v]) => [k, Math.round(v * 1000) / 10])
    ),
  };

  return NextResponse.json({
    outcomeIds,
    points: [initial, ...points],
    roundStart: round.createdAt.toISOString(),
  });
}
