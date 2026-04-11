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

const RPC = "https://api.devnet.solana.com";
const PLATFORM_FEE_PCT = 0.05;

export interface PayoutResult {
  betId: string;
  wallet: string;
  payout: number;
  txHash: string | null;
  error?: string;
}

export interface ResolveResult {
  roundId: string;
  winner: string;
  totalPool: number;
  platformFee: number;
  payoutPool: number;
  succeeded: number;
  failed: number;
  payouts: PayoutResult[];
}

export type ResolveOutcome =
  | ResolveResult
  | { message: string; payouts: PayoutResult[] };

export function loadPlatformKeypair(): Keypair {
  const key = process.env.PLATFORM_PRIVATE_KEY;
  if (!key) throw new Error("PLATFORM_PRIVATE_KEY env var is not set");
  try {
    const bytes = JSON.parse(key);
    return Keypair.fromSecretKey(Uint8Array.from(bytes));
  } catch {
    return Keypair.fromSecretKey(bs58.decode(key));
  }
}

export async function resolveRound(
  roundId: string,
  winner: "yes" | "no"
): Promise<ResolveOutcome> {
  const allBets = await prisma.bet.findMany({ where: { roundId, paid: false } });

  if (allBets.length === 0) {
    return { message: "No unpaid bets for this round", payouts: [] };
  }

  const winningBets = allBets.filter((b) => b.side === winner);
  const losingBets = allBets.filter((b) => b.side !== winner);

  if (losingBets.length > 0) {
    await prisma.bet.updateMany({
      where: { id: { in: losingBets.map((b) => b.id) } },
      data: { result: winner, paid: true, payout: 0 },
    });
  }

  if (winningBets.length === 0) {
    return { message: "No winning bets — losing bets marked resolved", payouts: [] };
  }

  const totalPool = allBets.reduce((s, b) => s + b.amount, 0);
  const payoutPool = totalPool * (1 - PLATFORM_FEE_PCT);
  const winningStake = winningBets.reduce((s, b) => s + b.amount, 0);

  const platformKeypair = loadPlatformKeypair();
  const connection = new Connection(RPC, "confirmed");
  const results: PayoutResult[] = [];

  for (const bet of winningBets) {
    const payoutSol = (bet.amount / winningStake) * payoutPool;
    const lamports = Math.floor(payoutSol * LAMPORTS_PER_SOL);

    if (lamports <= 0) {
      results.push({
        betId: bet.id,
        wallet: bet.walletAddress,
        payout: 0,
        txHash: null,
        error: "payout too small",
      });
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
      results.push({
        betId: bet.id,
        wallet: bet.walletAddress,
        payout: payoutSol,
        txHash: null,
        error: msg,
      });
    }
  }

  const succeeded = results.filter((r) => r.txHash).length;
  const failed = results.filter((r) => !r.txHash).length;

  // Mark round as resolved in DB (best-effort — round may be a legacy static round)
  try {
    await prisma.round.update({
      where: { id: roundId },
      data: { status: "resolved", winner, resolvedAt: new Date() },
    });
  } catch {
    // Round not in DB (legacy static round) — safe to ignore
  }

  return {
    roundId,
    winner,
    totalPool,
    platformFee: totalPool * PLATFORM_FEE_PCT,
    payoutPool,
    succeeded,
    failed,
    payouts: results,
  };
}
