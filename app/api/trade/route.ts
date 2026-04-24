import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";
import { costToBuy, getAllPrices, PLATFORM_FEE } from "@/lib/lmsr";
import { Outcome } from "@/lib/types";

export const dynamic = "force-dynamic";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";

function getPayload(req: NextRequest): { userId: string } | null {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try { return jwt.verify(auth.slice(7), JWT_SECRET) as { userId: string }; }
  catch { return null; }
}

// ── GET /api/trade?roundId=xxx ────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const roundId = new URL(req.url).searchParams.get("roundId");
  if (!roundId) return NextResponse.json({ error: "roundId required" }, { status: 400 });

  const round = await prisma.round.findUnique({
    where: { id: roundId },
    select: { lmsrB: true, shares: true, outcomes: true },
  });
  if (!round) return NextResponse.json({ error: "Round not found" }, { status: 404 });

  const currentShares = (round.shares as Record<string, number>) ?? {};
  const activeOutcomes = ((round.outcomes as unknown as Outcome[]) ?? []).map(o => o.id);
  const prices = getAllPrices(currentShares, round.lmsrB, activeOutcomes);

  const payload = getPayload(req);
  let positions: { outcome: string; shares: number; avgCost: number }[] = [];
  if (payload) {
    const rows = await prisma.position.findMany({
      where: { roundId, userId: payload.userId, shares: { gt: 0 } },
      select: { outcome: true, shares: true, avgCost: true },
    });
    positions = rows;
  }

  return NextResponse.json({ prices, currentShares, positions });
}

// ── POST /api/trade ───────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const payload = getPayload(req);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { roundId, outcome, type, shares: rawShares } = body;
  const sharesToTrade = parseFloat(rawShares);

  if (!roundId || !outcome || !type || !sharesToTrade || sharesToTrade <= 0)
    return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
  if (!["buy", "sell"].includes(type))
    return NextResponse.json({ error: "type must be buy or sell" }, { status: 400 });

  const round = await prisma.round.findUnique({
    where: { id: roundId },
    select: { id: true, status: true, lmsrB: true, shares: true, outcomes: true, bettingClosesAt: true, endsAt: true },
  });
  if (!round) return NextResponse.json({ error: "Round not found" }, { status: 404 });
  if (round.status !== "open") return NextResponse.json({ error: "Round is not open" }, { status: 400 });

  const bettingCloses = round.bettingClosesAt ?? round.endsAt;
  if (new Date() > bettingCloses) return NextResponse.json({ error: "Betting is closed" }, { status: 400 });

  const activeOutcomes = ((round.outcomes as unknown as Outcome[]) ?? []).map(o => o.id);
  if (!activeOutcomes.includes(outcome))
    return NextResponse.json({ error: "Invalid outcome" }, { status: 400 });

  const currentShares = (round.shares as Record<string, number>) ?? {};
  const b = round.lmsrB;

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  let totalCost: number; // positive = user pays, negative = user receives
  let rawCost: number;
  let fee: number;

  if (type === "buy") {
    rawCost  = costToBuy(currentShares, outcome, sharesToTrade, b, activeOutcomes);
    fee      = rawCost * PLATFORM_FEE;
    totalCost = rawCost + fee;
    if (user.doraBalance < totalCost)
      return NextResponse.json({ error: "Insufficient DORA balance" }, { status: 400 });
  } else {
    // sell: cost of buying negative shares → negative rawCost
    const pos = await prisma.position.findUnique({
      where: { userId_roundId_outcome: { userId: payload.userId, roundId, outcome } },
    });
    if (!pos || pos.shares < sharesToTrade)
      return NextResponse.json({ error: "Insufficient shares to sell" }, { status: 400 });

    rawCost  = costToBuy(currentShares, outcome, -sharesToTrade, b, activeOutcomes); // < 0
    const rawProceeds = -rawCost; // > 0
    fee      = rawProceeds * PLATFORM_FEE;
    totalCost = -(rawProceeds - fee); // negative = user receives
  }

  const pricePerShare = Math.abs(rawCost) / sharesToTrade;
  const sharesDelta   = type === "buy" ? sharesToTrade : -sharesToTrade;
  const newSharesMap  = {
    ...currentShares,
    [outcome]: (currentShares[outcome] ?? 0) + sharesDelta,
  };

  await prisma.$transaction(async tx => {
    await tx.round.update({ where: { id: roundId }, data: { shares: newSharesMap } });

    if (type === "buy") {
      await tx.user.update({ where: { id: payload.userId }, data: { doraBalance: { decrement: totalCost } } });
    } else {
      const proceeds = -totalCost; // positive
      await tx.user.update({ where: { id: payload.userId }, data: { doraBalance: { increment: proceeds } } });
    }

    // Upsert position
    const existing = await tx.position.findUnique({
      where: { userId_roundId_outcome: { userId: payload.userId, roundId, outcome } },
    });

    if (type === "buy") {
      if (existing) {
        const newTotal   = existing.shares + sharesToTrade;
        const newAvgCost = (existing.shares * existing.avgCost + sharesToTrade * pricePerShare) / newTotal;
        await tx.position.update({
          where: { userId_roundId_outcome: { userId: payload.userId, roundId, outcome } },
          data: { shares: newTotal, avgCost: newAvgCost },
        });
      } else {
        await tx.position.create({
          data: { userId: payload.userId, roundId, outcome, shares: sharesToTrade, avgCost: pricePerShare },
        });
      }
    } else {
      const newShares = (existing?.shares ?? 0) - sharesToTrade;
      await tx.position.update({
        where: { userId_roundId_outcome: { userId: payload.userId, roundId, outcome } },
        data: { shares: Math.max(0, newShares) },
      });
    }

    await tx.trade.create({
      data: {
        userId:    payload.userId,
        roundId,
        outcome,
        type,
        shares:    sharesToTrade,
        price:     pricePerShare,
        totalCost,
        fee,
      },
    });
  });

  const updatedUser = await prisma.user.findUnique({
    where: { id: payload.userId }, select: { doraBalance: true },
  });
  const newPrices = getAllPrices(newSharesMap, b, activeOutcomes);

  return NextResponse.json({
    success:    true,
    newBalance: updatedUser?.doraBalance,
    newShares:  (newSharesMap as Record<string, number>)[outcome],
    cost:       totalCost,
    fee,
    prices:     newPrices,
  });
}
