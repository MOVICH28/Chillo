import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";
import { getAllPrices } from "@/lib/lmsr";
import { Outcome } from "@/lib/types";

export const dynamic = "force-dynamic";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload: { userId: string };
  try { payload = jwt.verify(auth.slice(7), JWT_SECRET) as { userId: string }; }
  catch { return NextResponse.json({ error: "Invalid token" }, { status: 401 }); }

  const positions = await prisma.position.findMany({
    where: { userId: payload.userId, shares: { gt: 0 } },
    include: {
      round: {
        select: {
          id: true, question: true, status: true, winningOutcome: true,
          lmsrB: true, shares: true, outcomes: true,
          bettingClosesAt: true, endsAt: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const enriched = positions.map(pos => {
    const round = pos.round;
    const currentShares = (round.shares as Record<string, number>) ?? {};
    const activeOutcomes = ((round.outcomes as unknown as Outcome[]) ?? []).map(o => o.id);
    const prices = getAllPrices(currentShares, round.lmsrB, activeOutcomes);
    const currentPrice = prices[pos.outcome] ?? 0;
    const unrealizedPnl = (currentPrice - pos.avgCost) * pos.shares;
    const currentValue  = currentPrice * pos.shares;

    return {
      id:           pos.id,
      roundId:      round.id,
      question:     round.question,
      status:       round.status,
      winningOutcome: round.winningOutcome,
      outcome:      pos.outcome,
      shares:       pos.shares,
      avgCost:      pos.avgCost,
      currentPrice,
      currentValue,
      unrealizedPnl,
      updatedAt:      pos.updatedAt.toISOString(),
      bettingClosesAt: round.bettingClosesAt?.toISOString() ?? null,
      endsAt:          round.endsAt.toISOString(),
    };
  });

  const totalValue  = enriched.reduce((s, p) => s + p.currentValue, 0);
  const totalCost   = enriched.reduce((s, p) => s + p.avgCost * p.shares, 0);
  const totalPnl    = totalValue - totalCost;

  return NextResponse.json({ positions: enriched, totalValue, totalCost, totalPnl });
}
