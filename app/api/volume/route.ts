import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const agg = await prisma.trade.aggregate({
      where: { type: "buy" },
      _sum: { totalCost: true },
    });
    return NextResponse.json({ volume24h: agg._sum.totalCost ?? 0 });
  } catch {
    return NextResponse.json({ volume24h: 0 });
  }
}
