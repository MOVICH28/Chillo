import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/trade/resolve — settle LMSR positions for a resolved round.
// Authenticated with CRON_SECRET or called internally after round resolution.
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { roundId, winningOutcome } = await req.json();
  if (!roundId || !winningOutcome)
    return NextResponse.json({ error: "roundId and winningOutcome required" }, { status: 400 });

  const round = await prisma.round.findUnique({
    where: { id: roundId }, select: { status: true, winningOutcome: true },
  });
  if (!round) return NextResponse.json({ error: "Round not found" }, { status: 404 });
  if (round.status !== "resolved")
    return NextResponse.json({ error: "Round not resolved yet" }, { status: 400 });

  const positions = await prisma.position.findMany({
    where: { roundId, outcome: winningOutcome, shares: { gt: 0 } },
  });

  let totalPaid = 0;
  const results: { userId: string; shares: number; payout: number }[] = [];

  for (const pos of positions) {
    const payout = pos.shares * 1.0; // 1 DORA per winning share
    await prisma.$transaction([
      prisma.user.update({ where: { id: pos.userId }, data: { doraBalance: { increment: payout } } }),
      prisma.position.update({ where: { id: pos.id }, data: { shares: 0 } }),
    ]);
    totalPaid += payout;
    results.push({ userId: pos.userId, shares: pos.shares, payout });
  }

  return NextResponse.json({ settled: results.length, totalPaid, results });
}
