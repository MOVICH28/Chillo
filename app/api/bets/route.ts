import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { prisma } from "@/lib/prisma";

const PLATFORM_WALLET = "GsvhgEARAKjYX2oFRzgKpWU7XufuGPtVeN58M983prtb";
const RPC = "https://api.devnet.solana.com";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet param required" }, { status: 400 });
  try {
    const bets = await prisma.bet.findMany({
      where: { walletAddress: wallet },
      include: { round: { select: { question: true, status: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(
      bets.map((b) => ({ ...b, createdAt: b.createdAt.toISOString() }))
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

    // Verify transaction on-chain before trusting anything
    const valid = await verifyTransaction(txHash, amount);
    if (!valid) {
      return NextResponse.json(
        { error: "Transaction verification failed. Please ensure it confirmed on devnet." },
        { status: 400 }
      );
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
    const newNoPool  = side === "no"  ? round.noPool  + amount : round.noPool;
    const newTotal   = round.totalPool + amount;
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
