import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function computeOdds(yesPool: number, noPool: number, totalPool: number) {
  if (totalPool === 0 || yesPool === 0 || noPool === 0) {
    return { yesOdds: 2.0, noOdds: 2.0, yesPct: 50, noPct: 50 };
  }
  const yesOdds = parseFloat((totalPool / yesPool).toFixed(2));
  const noOdds = parseFloat((totalPool / noPool).toFixed(2));
  const yesPct = parseFloat(((yesPool / totalPool) * 100).toFixed(1));
  const noPct = parseFloat(((noPool / totalPool) * 100).toFixed(1));
  return { yesOdds, noOdds, yesPct, noPct };
}

export async function GET() {
  try {
    const rounds = await prisma.round.findMany({
      where: { status: { in: ["open", "closed"] } },
      include: { bets: { orderBy: { createdAt: "desc" }, take: 5 } },
      orderBy: { createdAt: "asc" },
    });

    const enriched = rounds.map((r: any) => ({
      ...r,
      ...computeOdds(r.yesPool, r.noPool, r.totalPool),
      endsAt: r.endsAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      bets: r.bets.map((b: any) => ({
        ...b,
        createdAt: b.createdAt.toISOString(),
      })),
    }));

    return NextResponse.json(enriched);
  } catch (error) {
    console.error("[GET /api/rounds]", error);
    return NextResponse.json({ error: "Failed to fetch rounds" }, { status: 500 });
  }
}
