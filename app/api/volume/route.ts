import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const agg = await prisma.trade.aggregate({
      where: { createdAt: { gte: since } },
      _sum: { totalCost: true },
    });
    return NextResponse.json({ volume24h: agg._sum.totalCost ?? 0 });
  } catch {
    return NextResponse.json({ volume24h: 0 });
  }
}
