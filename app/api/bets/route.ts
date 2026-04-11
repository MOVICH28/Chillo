import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const PLATFORM_WALLET = "GsvhgEARAKjYX2oFRzgKpWU7XufuGPtVeN58M983prtb";
const RPC = "https://api.devnet.solana.com";

// ── Validation helpers ────────────────────────────────────────────────────────

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIG_RE    = /^[1-9A-HJ-NP-Za-km-z]{86,88}$/;

function isValidSolanaAddress(addr: string): boolean {
  if (!BASE58_RE.test(addr)) return false;
  try { new PublicKey(addr); return true; } catch { return false; }
}

function isValidSignature(sig: string): boolean {
  return SIG_RE.test(sig);
}

// ── Rate limiting (in-memory, per wallet) ────────────────────────────────────

const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX       = 10;              // max bets per wallet per hour

function checkRateLimit(wallet: string): boolean {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(wallet) ?? []).filter(
    t => now - t < RATE_LIMIT_WINDOW_MS,
  );
  if (timestamps.length >= RATE_LIMIT_MAX) return false;
  timestamps.push(now);
  rateLimitMap.set(wallet, timestamps);
  return true;
}

// ── Transaction verification ──────────────────────────────────────────────────

const TX_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

async function verifyTransaction(
  txHash: string,
  expectedAmount: number,
  senderAddress: string,
): Promise<{ valid: boolean; reason?: string }> {
  const connection = new Connection(RPC, "confirmed");
  const expectedLamports = Math.round(expectedAmount * LAMPORTS_PER_SOL);

  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 2000));

    const tx = await connection.getTransaction(txHash, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (!tx || !tx.meta) continue;
    if (tx.meta.err) return { valid: false, reason: "transaction failed on-chain" };

    // Age check: blockTime is in seconds
    if (tx.blockTime) {
      const ageSec = Math.floor(Date.now() / 1000) - tx.blockTime;
      if (ageSec > TX_MAX_AGE_MS / 1000) {
        return { valid: false, reason: "transaction too old" };
      }
    }

    // Resolve account keys
    const message = tx.transaction.message;
    let accountKeys: string[];
    if ("staticAccountKeys" in message) {
      accountKeys = message.staticAccountKeys.map((k: PublicKey) => k.toBase58());
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      accountKeys = (message as any).accountKeys.map((k: PublicKey) => k.toBase58());
    }

    // Check platform wallet received funds
    const platformIdx = accountKeys.indexOf(PLATFORM_WALLET);
    if (platformIdx === -1) return { valid: false, reason: "platform wallet not in transaction" };

    // Check sender matches claimed wallet
    if (accountKeys[0] !== senderAddress) {
      return { valid: false, reason: "transaction sender does not match wallet" };
    }

    // Check amount within 1% tolerance
    const received = tx.meta.postBalances[platformIdx] - tx.meta.preBalances[platformIdx];
    const tolerance = Math.max(expectedLamports * 0.01, 1000);
    if (Math.abs(received - expectedLamports) > tolerance) {
      return { valid: false, reason: "amount mismatch" };
    }

    return { valid: true };
  }

  return { valid: false, reason: "transaction not found after retries" };
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");

  // Validate wallet param if provided
  if (wallet && !isValidSolanaAddress(wallet)) {
    return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
  }

  try {
    const bets = await prisma.bet.findMany({
      where: wallet ? { walletAddress: wallet } : undefined,
      orderBy: { createdAt: "desc" },
      take: wallet ? undefined : 10,
    });
    const roundIds = Array.from(new Set(bets.map(b => b.roundId)));
    const rounds = await prisma.round.findMany({ where: { id: { in: roundIds } } });
    const roundMap = new Map(rounds.map(r => [r.id, r]));

    return NextResponse.json(
      bets.map(b => {
        const round = roundMap.get(b.roundId);
        return {
          ...b,
          createdAt: b.createdAt.toISOString(),
          round: round ? { question: round.question, status: round.status } : null,
        };
      }),
    );
  } catch {
    return NextResponse.json({ error: "Failed to fetch bets" }, { status: 500 });
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { walletAddress, roundId, side, amount, txHash } = body;

    // ── Input validation ──────────────────────────────────────────────────────
    if (!walletAddress || !roundId || !side || !amount || !txHash) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!isValidSolanaAddress(walletAddress)) {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }
    if (side !== "yes" && side !== "no") {
      return NextResponse.json({ error: "side must be 'yes' or 'no'" }, { status: 400 });
    }
    if (typeof amount !== "number" || !isFinite(amount) || amount <= 0 || amount > 10000) {
      return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
    }
    if (!isValidSignature(txHash)) {
      return NextResponse.json({ error: "Invalid transaction signature format" }, { status: 400 });
    }

    // ── Rate limiting ─────────────────────────────────────────────────────────
    if (!checkRateLimit(walletAddress)) {
      return NextResponse.json(
        { error: "Rate limit exceeded: max 10 bets per hour" },
        { status: 429 },
      );
    }

    // ── Round validation ──────────────────────────────────────────────────────
    const round = await prisma.round.findUnique({ where: { id: roundId } });
    if (!round) {
      return NextResponse.json({ error: "Round not found" }, { status: 404 });
    }
    if (round.status !== "open") {
      return NextResponse.json({ error: "Round is not open for betting" }, { status: 400 });
    }
    if (new Date() > round.endsAt) {
      return NextResponse.json({ error: "Round has ended" }, { status: 400 });
    }

    // ── On-chain verification ─────────────────────────────────────────────────
    let verifyResult: { valid: boolean; reason?: string } = { valid: false, reason: "not attempted" };
    try {
      verifyResult = await verifyTransaction(txHash, amount, walletAddress);
    } catch (err) {
      console.error("[POST /api/bets] tx verification threw:", err instanceof Error ? err.message : "unknown");
    }

    const status = verifyResult.valid ? "verified" : "unverified";
    if (!verifyResult.valid) {
      console.warn(`[POST /api/bets] tx unverified: ${verifyResult.reason}`);
    }

    // ── Upsert pool ───────────────────────────────────────────────────────────
    const baseYes = round.yesPool;
    const baseNo  = round.noPool;

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
    console.error("[POST /api/bets] unhandled error");
    return NextResponse.json({ error: "Failed to register bet" }, { status: 500 });
  }
}
