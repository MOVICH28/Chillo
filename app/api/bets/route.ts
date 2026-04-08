import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { walletAddress, roundId, side, amount, txHash } = body;

    if (!walletAddress || !roundId || !side || !amount || !txHash) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (side !== "yes" && side !== "no") {
      return NextResponse.json({ error: "side must be 'yes' or 'no'" }, { status: 400 });
    }
    if (typeof amount !== "number" || amount <= 0) {
      return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
    }

    const round = await prisma.round.findUnique({ where: { id: roundId } });
    if (!round) return NextResponse.json({ error: "Round not found" }, { status: 404 });
    if (round.status !== "open") {
      return NextResponse.json({ error: "Round is not open for betting" }, { status: 400 });
    }
    if (new Date() > round.endsAt) {
      return NextResponse.json({ error: "Round has ended" }, { status: 400 });
    }

    const newYesPool = side === "yes" ? round.yesPool + amount : round.yesPool;
    const newNoPool = side === "no" ? round.noPool + amount : round.noPool;
    const newTotal = round.totalPool + amount;
    const odds =
      side === "yes"
        ? newTotal / Math.max(newYesPool, 0.001)
        : newTotal / Math.max(newNoPool, 0.001);

    const [bet] = await prisma.$transaction([
      prisma.bet.create({
        data: { walletAddress, roundId, side, amount, odds: parseFloat(odds.toFixed(2)), txHash },
      }),
      prisma.round.update({
        where: { id: roundId },
        data: { yesPool: newYesPool, noPool: newNoPool, totalPool: newTotal },
      }),
    ]);

    return NextResponse.json({ ...bet, createdAt: bet.createdAt.toISOString() }, { status: 201 });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return NextResponse.json({ error: "Bet with this txHash already exists" }, { status: 409 });
    }
    console.error("[POST /api/bets]", error);
    return NextResponse.json({ error: "Failed to register bet" }, { status: 500 });
  }
}
