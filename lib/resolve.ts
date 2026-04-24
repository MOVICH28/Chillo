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

// ─── LMSR position settlement ─────────────────────────────────────────────────
async function settleLmsrPositions(roundId: string, winningOutcome: string) {
  const positions = await prisma.position.findMany({
    where: { roundId, outcome: winningOutcome, shares: { gt: 0 } },
  });
  for (const pos of positions) {
    const payout = pos.shares * 1.0; // 1 DORA per winning share
    await prisma.$transaction([
      prisma.user.update({ where: { id: pos.userId }, data: { doraBalance: { increment: payout } } }),
      prisma.position.update({ where: { id: pos.id },   data: { shares: 0 } }),
    ]);
    console.log(`[lmsr] Settled ${pos.shares} shares → ${payout} DORA for user ${pos.userId}`);
  }
  console.log(`[lmsr] Settled ${positions.length} LMSR positions for round ${roundId}`);
}

const RPC = "https://api.devnet.solana.com";
const PLATFORM_FEE_PCT = 0.05;

export interface PayoutResult {
  betId: string;
  wallet: string;
  payout: number;
  txHash: string | null;
  error?: string;
}

export interface RefundResult {
  betId: string;
  wallet: string;
  refund: number;
  txHash: string | null;
  error?: string;
}

export interface ResolveResult {
  type: "payout";
  roundId: string;
  winner: string;
  totalPool: number;
  platformFee: number;
  payoutPool: number;
  succeeded: number;
  failed: number;
  payouts: PayoutResult[];
}

export interface RefundOutcome {
  type: "refund";
  reason: "all_one_side";
  roundId: string;
  winner: string;
  totalRefunded: number;
  succeeded: number;
  failed: number;
  refunds: RefundResult[];
}

export interface NoBetsResult {
  type: "no_bets";
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
  | RefundOutcome
  | NoBetsResult
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
  winner: string  // "yes" | "no" for pumpfun, or "A"|"B"|"C"|"D" for range rounds
): Promise<ResolveOutcome> {
  const allBets = await prisma.bet.findMany({ where: { roundId, paid: false } });

  const isRange = ["A", "B", "C", "D", "E", "F"].includes(winner);

  if (allBets.length === 0) {
    try {
      await prisma.round.update({
        where: { id: roundId },
        data: {
          status: "resolved",
          winner,
          resolvedAt: new Date(),
          ...(isRange ? { winningOutcome: winner } : {}),
        },
      });
    } catch { /* legacy static round */ }
    try { await settleLmsrPositions(roundId, winner); } catch (err) {
      console.error(`[lmsr] settlement error for ${roundId}:`, err instanceof Error ? err.message : err);
    }
    return {
      type: "no_bets",
      roundId,
      winner,
      totalPool: 0,
      platformFee: 0,
      payoutPool: 0,
      succeeded: 0,
      failed: 0,
      payouts: [],
    };
  }

  const winningBets = allBets.filter((b) => b.side === winner);
  const losingBets = allBets.filter((b) => b.side !== winner);

  // ── All bets on one side: refund everyone 100% ────────────────────────────
  if (losingBets.length === 0) {
    console.log(`[resolve] Round ${roundId}: all bets on one side — issuing full refunds`);
    const platformKeypair = loadPlatformKeypair();
    const connection = new Connection(RPC, "confirmed");
    const refundResults: RefundResult[] = [];

    for (const bet of allBets) {
      const isDoraBet = bet.walletAddress.startsWith("dora:");
      if (isDoraBet) {
        const userId = bet.walletAddress.slice(5);
        try {
          await prisma.user.update({
            where: { id: userId },
            data: { doraBalance: { increment: bet.amount } },
          });
          await prisma.bet.update({
            where: { id: bet.id },
            data: { result: "refund", payout: bet.amount, paid: true },
          });
          refundResults.push({ betId: bet.id, wallet: bet.walletAddress, refund: bet.amount, txHash: "dora_refund" });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          refundResults.push({ betId: bet.id, wallet: bet.walletAddress, refund: bet.amount, txHash: null, error: msg });
        }
        continue;
      }

      const lamports = Math.floor(bet.amount * LAMPORTS_PER_SOL);
      if (lamports <= 0) {
        refundResults.push({ betId: bet.id, wallet: bet.walletAddress, refund: 0, txHash: null, error: "amount too small" });
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
          data: { result: "refund", payout: bet.amount, paid: true },
        });
        refundResults.push({ betId: bet.id, wallet: bet.walletAddress, refund: bet.amount, txHash });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[resolve] refund failed for bet ${bet.id}`);
        refundResults.push({ betId: bet.id, wallet: bet.walletAddress, refund: bet.amount, txHash: null, error: msg });
      }
    }

    try {
      await prisma.round.update({
        where: { id: roundId },
        data: {
          status: "resolved",
          winner,
          resolvedAt: new Date(),
          ...(isRange ? { winningOutcome: winner } : {}),
        },
      });
    } catch { /* legacy static round */ }

    const succeeded = refundResults.filter((r) => r.txHash).length;
    const failed    = refundResults.filter((r) => !r.txHash).length;
    console.log(`[resolve] Round ${roundId} refunded: ${succeeded} succeeded, ${failed} failed`);

    try { await settleLmsrPositions(roundId, winner); } catch (err) {
      console.error(`[lmsr] settlement error for ${roundId}:`, err instanceof Error ? err.message : err);
    }

    return {
      type: "refund",
      reason: "all_one_side",
      roundId,
      winner,
      totalRefunded: allBets.reduce((s, b) => s + b.amount, 0),
      succeeded,
      failed,
      refunds: refundResults,
    };
  }

  // ── Normal resolution ─────────────────────────────────────────────────────
  if (losingBets.length > 0) {
    await prisma.bet.updateMany({
      where: { id: { in: losingBets.map((b) => b.id) } },
      data: { result: winner, paid: true, payout: 0 },
    });
  }

  if (winningBets.length === 0) {
    try {
      await prisma.round.update({
        where: { id: roundId },
        data: {
          status: "resolved",
          winner,
          resolvedAt: new Date(),
          ...(isRange ? { winningOutcome: winner } : {}),
        },
      });
    } catch { /* legacy static round */ }
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
    const isDoraBet = bet.walletAddress.startsWith("dora:");

    if (isDoraBet) {
      const userId = bet.walletAddress.slice(5);
      try {
        await prisma.user.update({
          where: { id: userId },
          data: { doraBalance: { increment: payoutSol } },
        });
        await prisma.bet.update({
          where: { id: bet.id },
          data: { result: winner, payout: payoutSol, paid: true },
        });
        results.push({ betId: bet.id, wallet: bet.walletAddress, payout: payoutSol, txHash: "dora_payout" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[resolve] DORA payout failed for bet ${bet.id}:`, msg);
        results.push({ betId: bet.id, wallet: bet.walletAddress, payout: payoutSol, txHash: null, error: msg });
      }
      continue;
    }

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
      data: {
        status: "resolved",
        winner,
        resolvedAt: new Date(),
        ...(isRange ? { winningOutcome: winner } : {}),
      },
    });
  } catch {
    // Round not in DB (legacy static round) — safe to ignore
  }

  // Settle LMSR positions for winning outcome (best-effort)
  try { await settleLmsrPositions(roundId, winner); } catch (err) {
    console.error(`[lmsr] settlement error for ${roundId}:`, err instanceof Error ? err.message : err);
  }

  return {
    type: "payout" as const,
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
