import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const trades = await prisma.trade.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { user: { select: { username: true } } },
  });

  return NextResponse.json(
    trades.map(t => ({
      id:         t.id,
      username:   t.user?.username ?? null,
      outcome:    t.outcome,
      type:       t.type,
      totalCost:  t.totalCost,
      profitLoss: t.profitLoss ?? null,
      createdAt:  t.createdAt.toISOString(),
    }))
  );
}
