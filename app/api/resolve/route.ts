import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { prisma } from "@/lib/prisma";
import { ROUNDS_DATA } from "@/lib/rounds-data";

const RPC = "https://api.devnet.solana.com";
const PLATFORM_FEE_PCT = 0.05;

function loadPlatformKeypair(): Keypair {
  const key = process.env.PLATFORM_PRIVATE_KEY;
  if (!key) throw new Error("PLATFORM_PRIVATE_KEY env var is not set");
  // Support JSON byte array [1,2,...,64] or base58 string
  try {
    const bytes = JSON.parse(key);
    return Keypair.fromSecretKey(Uint8Array.from(bytes));
  } catch {
    return Keypair.fromSecretKey(bs58.decode(key));
  }
}

export async function POST(req: NextRequest) {
  let roundId: string;
  let winner: string;

  try {
    const body = await req.json();
    roundId = body.roundId;
    winner = body.winner;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!roundId || !winner) {
    return NextResponse.json({ error: "roundId and winner are required" }, { status: 400 });
  }
  if (winner !== "yes" && winner !== "no") {
    return NextResponse.json({ error: "winner must be 'yes' or 'no'" }, { status: 400 });
  }

  const round = ROUNDS_DATA.find((r) => r.id === roundId);
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  // Fetch all bets for this round that haven't been paid yet
  const allBets = await prisma.bet.findMany({
    where: { roundId, paid: false },
  });

  if (allBets.length === 0) {
    return NextResponse.json({ message: "No unpaid bets for this round", payouts: [] });
  }

  const winningBets = allBets.filter((b) => b.side === winner);

  // Mark losing bets as resolved with no payout
  const losingBets = allBets.filter((b) => b.side !== winner);
  if (losingBets.length > 0) {
    await prisma.bet.updateMany({
      where: { id: { in: losingBets.map((b) => b.id) } },
      data: { result: winner, paid: true, payout: 0 },
    });
  }

  if (winningBets.length === 0) {
    return NextResponse.json({
      message: "No winning bets — losing bets marked resolved",
      payouts: [],
    });
  }

  // Calculate payouts: 95% of total pool split proportionally among winners
  const totalPool = allBets.reduce((s, b) => s + b.amount, 0);
  const payoutPool = totalPool * (1 - PLATFORM_FEE_PCT);
  const winningStake = winningBets.reduce((s, b) => s + b.amount, 0);

  let platformKeypair: Keypair;
  try {
    platformKeypair = loadPlatformKeypair();
  } catch (err) {
    console.error("[resolve] keypair load failed:", err);
    return NextResponse.json({ error: "Platform wallet not configured" }, { status: 500 });
  }

  const connection = new Connection(RPC, "confirmed");
  const results: { betId: string; wallet: string; payout: number; txHash: string | null; error?: string }[] = [];

  for (const bet of winningBets) {
    const payoutSol = (bet.amount / winningStake) * payoutPool;
    const lamports = Math.floor(payoutSol * LAMPORTS_PER_SOL);

    if (lamports <= 0) {
      results.push({ betId: bet.id, wallet: bet.walletAddress, payout: 0, txHash: null, error: "payout too small" });
      continue;
    }

    try {
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: platformKeypair.publicKey,
          toPubkey: new PublicKey(bet.walletAddress),
          lamports,
        })
      );

      const txHash = await sendAndConfirmTransaction(connection, tx, [platformKeypair], {
        commitment: "confirmed",
      });

      await prisma.bet.update({
        where: { id: bet.id },
        data: { result: winner, payout: payoutSol, paid: true },
      });

      results.push({ betId: bet.id, wallet: bet.walletAddress, payout: payoutSol, txHash });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[resolve] payout failed for bet ${bet.id}:`, msg);
      // Don't mark as paid — can retry
      results.push({ betId: bet.id, wallet: bet.walletAddress, payout: payoutSol, txHash: null, error: msg });
    }
  }

  const succeeded = results.filter((r) => r.txHash).length;
  const failed = results.filter((r) => !r.txHash).length;

  return NextResponse.json({
    roundId,
    winner,
    totalPool,
    platformFee: totalPool * PLATFORM_FEE_PCT,
    payoutPool,
    succeeded,
    failed,
    payouts: results,
  });
}
