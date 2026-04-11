import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const PLATFORM_WALLET = "GsvhgEARAKjYX2oFRzgKpWU7XufuGPtVeN58M983prtb";
const RPC = "https://api.devnet.solana.com";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  try {
    const bets = await prisma.bet.findMany({
      where: wallet ? { walletAddress: wallet } : undefined,
      orderBy: { createdAt: "desc" },
      take: wallet ? undefined : 10, // live feed: last 10 across all wallets
    });
    const roundIds = Array.from(new Set(bets.map((b) => b.roundId)));
    const rounds = await prisma.round.findMany({ where: { id: { in: roundIds } } });
    const roundMap = new Map(rounds.map((r) => [r.id, r]));

    return NextResponse.json(
      bets.map((b) => {
        const round = roundMap.get(b.roundId);
        return {
          ...b,
          createdAt: b.createdAt.toISOString(),
          round: round ? { question: round.question, status: round.status } : null,
        };
      })
    );
  } catch (error) {
    console.error("[GET /api/bets]", error);
    return NextResponse.json({ error: "Failed to fetch bets" }, { status: 500 });
  }
}

async function verifyTransaction(txHash: string, expectedAmount: number): Promise<boolean> {
  const connection = new Connection(RPC, "confirmed");
  const expectedLamports = Math.round(expectedAmount * LAMPORTS_PER_SOL);

  // Retry a few times — the transaction may take a moment to propagate
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2000));

    const tx = await connection.getTransaction(txHash, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (!tx || !tx.meta) continue;
    if (tx.meta.err) return false; // transaction failed on-chain

    // Resolve account keys (handles both legacy and versioned transactions)
    const message = tx.transaction.message;
    let accountKeys: string[];
    if ("staticAccountKeys" in message) {
      accountKeys = message.staticAccountKeys.map((k: PublicKey) => k.toBase58());
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      accountKeys = (message as any).accountKeys.map((k: PublicKey) => k.toBase58());
    }

    const platformIdx = accountKeys.indexOf(PLATFORM_WALLET);
    if (platformIdx === -1) return false;

    const received = tx.meta.postBalances[platformIdx] - tx.meta.preBalances[platformIdx];
    // Allow 1% tolerance for any rounding
    const tolerance = Math.max(expectedLamports * 0.01, 1000); // min 1000 lamports
    if (Math.abs(received - expectedLamports) > tolerance) return false;

    return true;
  }

  return false;
}

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

    // Find round from DB BEFORE any on-chain work
    console.log(`[POST /api/bets] roundId received: ${roundId}`);
    const round = await prisma.round.findUnique({ where: { id: roundId } });
    if (!round) {
      console.error(`[POST /api/bets] round not found in DB for id: ${roundId}`);
      return NextResponse.json({ error: "Round not found" }, { status: 404 });
    }
    console.log(`[POST /api/bets] found round: ${round.id} status=${round.status}`);
    if (round.status !== "open") {
      return NextResponse.json({ error: "Round is not open for betting" }, { status: 400 });
    }
    if (new Date() > round.endsAt) {
      return NextResponse.json({ error: "Round has ended" }, { status: 400 });
    }

    // Verify transaction on-chain — save as "unverified" if it fails so we don't lose the record
    let valid = false;
    try {
      valid = await verifyTransaction(txHash, amount);
    } catch (err) {
      console.warn(`[POST /api/bets] tx ${txHash} verification threw — saving as unverified:`, err);
    }
    const status = valid ? "verified" : "unverified";

    if (!valid) {
      console.warn(`[POST /api/bets] tx ${txHash} failed verification — saving as unverified`);
    }

    // Upsert RoundPool atomically, then compute odds from live totals
    // Seed with round's base pools so odds start realistically (not from zero)
    const baseYes = round.yesPool;
    const baseNo  = round.noPool;
    console.log(`[POST /api/bets] upserting RoundPool for roundId=${round.id} side=${side} amount=${amount} base=${baseYes}/${baseNo}`);
    const pool = await prisma.roundPool.upsert({
      where: { roundId },
      create: {
        roundId,
        yesPool:   (side === "yes" ? amount : 0) + baseYes,
        noPool:    (side === "no"  ? amount : 0) + baseNo,
        totalPool: amount + baseYes + baseNo,
      },
      update:
        side === "yes"
          ? { yesPool: { increment: amount }, totalPool: { increment: amount } }
          : { noPool: { increment: amount }, totalPool: { increment: amount } },
    });

    const odds =
      side === "yes"
        ? pool.totalPool / Math.max(pool.yesPool, 0.001)
        : pool.totalPool / Math.max(pool.noPool, 0.001);

    const bet = await prisma.bet.create({
      data: {
        walletAddress,
        roundId,
        side,
        amount,
        odds: parseFloat(odds.toFixed(2)),
        txHash,
        status,
      },
    });

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
