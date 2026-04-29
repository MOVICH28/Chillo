import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [volumeAgg, bets24h, activeMarkets] = await Promise.all([
      prisma.trade.aggregate({
        where: { createdAt: { gte: since } },
        _sum: { totalCost: true },
      }),
      prisma.trade.count({ where: { createdAt: { gte: since } } }),
      prisma.round.count({ where: { createdAt: { gte: since } } }),
    ]);
    return NextResponse.json({
      volume24h:     volumeAgg._sum.totalCost ?? 0,
      bets24h,
      activeMarkets,
    });
  } catch {
    return NextResponse.json({ volume24h: 0, bets24h: 0, activeMarkets: 0 });
  }
}
