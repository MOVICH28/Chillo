import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const trades = await prisma.trade.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { user: { select: { username: true, avatarUrl: true } } },
  });

  return NextResponse.json(
    trades.map(t => ({
      id:         t.id,
      username:   t.user?.username ?? null,
      avatarUrl:  t.user?.avatarUrl ?? null,
      type:       t.type,
      outcome:    t.outcome,
      amount:     t.type === "buy" ? t.totalCost : -t.totalCost,
      profitLoss: t.profitLoss ?? null,
      roundId:    t.roundId,
      createdAt:  t.createdAt.toISOString(),
    }))
  );
}
