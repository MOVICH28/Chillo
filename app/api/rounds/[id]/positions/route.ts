import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const positions = await prisma.position.findMany({
      where: { roundId: id, shares: { gt: 0.001 } },
      orderBy: { shares: "desc" },
      include: { user: { select: { username: true, avatarUrl: true } } },
    });

    const byOutcome: Record<string, Array<{
      username: string;
      avatarUrl: string | null;
      shares: number;
      invested: number;
    }>> = {};

    for (const pos of positions) {
      const key = pos.outcome;
      if (!byOutcome[key]) byOutcome[key] = [];
      byOutcome[key].push({
        username: pos.user.username,
        avatarUrl: pos.user.avatarUrl,
        shares: pos.shares,
        invested: parseFloat((pos.avgCost * pos.shares).toFixed(2)),
      });
    }

    return NextResponse.json(byOutcome);
  } catch (err) {
    console.error("[positions]", err);
    return NextResponse.json({}, { status: 500 });
  }
}
