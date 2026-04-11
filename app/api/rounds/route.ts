import { NextResponse } from "next/server";
import { ROUNDS_DATA } from "@/lib/rounds-data";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function computeOdds(yesPool: number, noPool: number, totalPool: number) {
  if (totalPool === 0) {
    return { yesOdds: 2.0, noOdds: 2.0, yesPct: 50, noPct: 50 };
  }
  return {
    yesOdds: parseFloat(Math.max(1.05, totalPool / Math.max(yesPool, 0.001)).toFixed(2)),
    noOdds: parseFloat(Math.max(1.05, totalPool / Math.max(noPool, 0.001)).toFixed(2)),
    yesPct: parseFloat(((yesPool / totalPool) * 100).toFixed(1)),
    noPct: parseFloat(((noPool / totalPool) * 100).toFixed(1)),
  };
}

export async function GET() {
  const pools = await prisma.roundPool.findMany();
  const poolMap = new Map(pools.map((p) => [p.roundId, p]));

  const rounds = ROUNDS_DATA.map((round) => {
    const db = poolMap.get(round.id);
    if (db) {
      return {
        ...round,
        yesPool: db.yesPool,
        noPool: db.noPool,
        totalPool: db.totalPool,
        ...computeOdds(db.yesPool, db.noPool, db.totalPool),
      };
    }
    return round;
  });

  return NextResponse.json(rounds);
}
