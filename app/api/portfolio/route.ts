import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";
import { getAllPrices, costToBuy, PLATFORM_FEE } from "@/lib/lmsr";
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
    where: { userId: payload.userId },
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

  // Fetch all sell trades in one query to compute proceeds per position
  const sellTrades = await prisma.trade.findMany({
    where: { userId: payload.userId, type: "sell" },
    select: { roundId: true, outcome: true, totalCost: true },
  });
  const sellMap: Record<string, number> = {};
  for (const t of sellTrades) {
    const key = `${t.roundId}:${t.outcome}`;
    // totalCost is stored as negative for sells; negate to get proceeds
    sellMap[key] = (sellMap[key] ?? 0) + (-t.totalCost);
  }

  const enriched = positions.map(pos => {
    const round = pos.round;
    const isSold = pos.shares <= 0;
    const key = `${round.id}:${pos.outcome}`;
    const soldProceeds = parseFloat((sellMap[key] ?? 0).toFixed(4));

    const currentShares = (round.shares as Record<string, number>) ?? {};
    const activeOutcomes = ((round.outcomes as unknown as Outcome[]) ?? []).map(o => o.id);
    const prices = getAllPrices(currentShares, round.lmsrB, activeOutcomes);
    const currentPrice = prices[pos.outcome] ?? 0;

    // For open positions: compute actual sell proceeds via LMSR integral
    const rawProceeds = isSold ? 0 : -costToBuy(currentShares, pos.outcome, -pos.shares, round.lmsrB, activeOutcomes);
    const currentValue = isSold ? 0 : Math.max(0, rawProceeds * (1 - PLATFORM_FEE));
    const amountInvested = pos.avgCost * pos.shares; // 0 for fully-sold positions (shares=0)
    const unrealizedPnl = currentValue - amountInvested;
    const totalOutcomeShares = currentShares[pos.outcome] ?? 0;
    const isSoleTrader = !isSold && totalOutcomeShares > 0 && pos.shares >= totalOutcomeShares * 0.99;

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
      amountInvested: parseFloat((pos.avgCost * pos.shares).toFixed(4)),
      unrealizedPnl,
      isSoleTrader,
      isSold,
      soldProceeds,
      updatedAt:      pos.updatedAt.toISOString(),
      bettingClosesAt: round.bettingClosesAt?.toISOString() ?? null,
      endsAt:          round.endsAt.toISOString(),
    };
  });

  // Summary totals only count open positions
  const open = enriched.filter(p => !p.isSold);
  const totalValue  = open.reduce((s, p) => s + p.currentValue, 0);
  const totalCost   = open.reduce((s, p) => s + p.amountInvested, 0);
  const totalPnl    = totalValue - totalCost;

  return NextResponse.json({ positions: enriched, totalValue, totalCost, totalPnl });
}
