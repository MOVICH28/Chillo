import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";
import { Outcome } from "@/lib/types";

export const dynamic = "force-dynamic";

const PLATFORM_WALLET = "GsvhgEARAKjYX2oFRzgKpWU7XufuGPtVeN58M983prtb";
const RPC = "https://api.devnet.solana.com";
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";

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

// ── Rate limiting ─────────────────────────────────────────────────────────────

const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX       = 10;

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(key) ?? []).filter(
    t => now - t < RATE_LIMIT_WINDOW_MS,
  );
  if (timestamps.length >= RATE_LIMIT_MAX) return false;
  timestamps.push(now);
  rateLimitMap.set(key, timestamps);
  return true;
}

// ── JWT helper ────────────────────────────────────────────────────────────────

function getUserIdFromRequest(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as { userId: string };
    return payload.userId;
  } catch {
    return null;
  }
}

// ── Transaction verification ──────────────────────────────────────────────────

const TX_MAX_AGE_MS = 5 * 60 * 1000;

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

    if (tx.blockTime) {
      const ageSec = Math.floor(Date.now() / 1000) - tx.blockTime;
      if (ageSec > TX_MAX_AGE_MS / 1000) {
        return { valid: false, reason: "transaction too old" };
      }
    }

    const message = tx.transaction.message;
    let accountKeys: string[];
    if ("staticAccountKeys" in message) {
      accountKeys = message.staticAccountKeys.map((k: PublicKey) => k.toBase58());
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      accountKeys = (message as any).accountKeys.map((k: PublicKey) => k.toBase58());
    }

    const platformIdx = accountKeys.indexOf(PLATFORM_WALLET);
    if (platformIdx === -1) return { valid: false, reason: "platform wallet not in transaction" };

    if (accountKeys[0] !== senderAddress) {
      return { valid: false, reason: "transaction sender does not match wallet" };
    }

    const received  = tx.meta.postBalances[platformIdx] - tx.meta.preBalances[platformIdx];
    const tolerance = Math.max(expectedLamports * 0.01, 1000);
    if (Math.abs(received - expectedLamports) > tolerance) {
      return { valid: false, reason: "amount mismatch" };
    }

    return { valid: true };
  }

  return { valid: false, reason: "transaction not found after retries" };
}

// ── Pool update helper (returns locked-in odds) ───────────────────────────────

type RoundRow = NonNullable<Awaited<ReturnType<typeof prisma.round.findUnique>>>;

async function updatePoolAndGetOdds(round: RoundRow, side: string, amount: number): Promise<number> {
  const isRange = round.outcomes !== null;

  if (isRange) {
    const outcomes = round.outcomes as unknown as Outcome[];
    const updatedOutcomes = outcomes.map(o =>
      o.id === side ? { ...o, pool: o.pool + amount } : o,
    );
    const outcomePool = updatedOutcomes.find(o => o.id === side)!.pool;
    const newTotalPool = updatedOutcomes.reduce((s, o) => s + o.pool, 0);
    const odds = parseFloat(
      Math.max(1.05, (newTotalPool * 0.95) / Math.max(outcomePool, 0.001)).toFixed(2),
    );

    await prisma.$transaction([
      prisma.round.update({
        where: { id: round.id },
        data: { totalPool: newTotalPool, outcomes: updatedOutcomes as unknown as Prisma.InputJsonValue },
      }),
      prisma.roundPool.upsert({
        where: { roundId: round.id },
        create: { roundId: round.id, yesPool: 0, noPool: 0, totalPool: newTotalPool },
        update: { totalPool: { increment: amount } },
      }),
    ]);

    return odds;
  }

  // Yes/No round
  const newYesPool   = round.yesPool + (side === "yes" ? amount : 0);
  const newNoPool    = round.noPool  + (side === "no"  ? amount : 0);
  const newTotalPool = round.totalPool + amount;

  const odds = parseFloat(
    (side === "yes"
      ? newTotalPool / Math.max(newYesPool, 0.001)
      : newTotalPool / Math.max(newNoPool, 0.001)
    ).toFixed(2),
  );

  await prisma.roundPool.upsert({
    where: { roundId: round.id },
    create: { roundId: round.id, yesPool: newYesPool, noPool: newNoPool, totalPool: newTotalPool },
    update:
      side === "yes"
        ? { yesPool: { increment: amount }, totalPool: { increment: amount } }
        : { noPool: { increment: amount }, totalPool: { increment: amount } },
  });

  return odds;
}

// ── Shared round/side validation ──────────────────────────────────────────────

function validateRoundAndSide(round: RoundRow, side: string): string | null {
  if (round.status !== "open") return "Round is not open for betting";
  if (new Date() > round.endsAt) return "Round has ended";

  const isRange = round.outcomes !== null;
  if (isRange) {
    const outcomes = round.outcomes as unknown as Outcome[];
    if (!outcomes.map(o => o.id).includes(side)) {
      return `Invalid outcome — must be one of ${outcomes.map(o => o.id).join(", ")}`;
    }
    if (round.bettingClosesAt && new Date() > round.bettingClosesAt) {
      return "Betting is closed for this round";
    }
  } else {
    if (side !== "yes" && side !== "no") return "side must be 'yes' or 'no'";
  }

  return null;
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const roundId = req.nextUrl.searchParams.get("roundId");

  try {
    const trades = await prisma.trade.findMany({
      where: roundId ? { roundId } : undefined,
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        user:  { select: { username: true, avatarUrl: true } },
        round: { select: { question: true, status: true, winningOutcome: true, targetToken: true } },
      },
    });

    return NextResponse.json(
      trades.map(t => ({
        id:            t.id,
        walletAddress: t.user?.username ?? "anon",
        avatarUrl:     t.user?.avatarUrl ?? null,
        side:          t.outcome,
        type:          t.type,
        amount:        t.totalCost,
        profitLoss:    t.profitLoss ?? null,
        roundId:       t.roundId,
        createdAt:     t.createdAt.toISOString(),
        round:         { question: t.round.question, status: t.round.status, targetToken: t.round.targetToken ?? null },
      })),
    );
  } catch {
    return NextResponse.json({ error: "Failed to fetch bets" }, { status: 500 });
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const currency = (body.currency as string) ?? "SOL";
    const userId = getUserIdFromRequest(req);

    // ── DORA bet flow ─────────────────────────────────────────────────────────
    if (currency === "DORA") {
      if (!userId) {
        return NextResponse.json({ error: "Authentication required for DORA bets" }, { status: 401 });
      }

      const { roundId, side, amount } = body;

      if (!roundId || !side || !amount) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
      }
      const VALID_SIDES = ["yes", "no", "A", "B", "C", "D", "E", "F"];
      if (!VALID_SIDES.includes(side)) {
        return NextResponse.json({ error: "Invalid side value" }, { status: 400 });
      }
      if (typeof amount !== "number" || !isFinite(amount) || amount <= 0 || amount > 10000) {
        return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
      }
      if (!checkRateLimit(`dora:${userId}`)) {
        return NextResponse.json({ error: "Rate limit exceeded: max 10 bets per hour" }, { status: 429 });
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
      if (user.doraBalance < amount) {
        return NextResponse.json({ error: "Insufficient DORA balance" }, { status: 400 });
      }

      const round = await prisma.round.findUnique({ where: { id: roundId } });
      if (!round) return NextResponse.json({ error: "Round not found" }, { status: 404 });

      const validationError = validateRoundAndSide(round, side);
      if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

      const odds = await updatePoolAndGetOdds(round, side, amount);

      const walletAddress = `dora:${userId}`;
      const txHash = `dora_${randomUUID()}`;

      // Atomically deduct balance and record the bet
      const [, bet] = await prisma.$transaction([
        prisma.user.update({
          where: { id: userId },
          data: { doraBalance: { decrement: amount } },
        }),
        prisma.bet.create({
          data: { walletAddress, roundId, side, amount, odds, txHash, status: "verified", userId, currency: "DORA" },
        }),
      ]);

      return NextResponse.json({ ...bet, createdAt: bet.createdAt.toISOString() }, { status: 201 });
    }

    // ── SOL bet flow ──────────────────────────────────────────────────────────
    const { walletAddress, roundId, side, amount, txHash } = body;

    if (!walletAddress || !roundId || !side || !amount || !txHash) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!isValidSolanaAddress(walletAddress)) {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }
    const VALID_SIDES = ["yes", "no", "A", "B", "C", "D", "E", "F"];
    if (!VALID_SIDES.includes(side)) {
      return NextResponse.json({ error: "Invalid side value" }, { status: 400 });
    }
    if (typeof amount !== "number" || !isFinite(amount) || amount <= 0 || amount > 10000) {
      return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
    }
    if (!isValidSignature(txHash)) {
      return NextResponse.json({ error: "Invalid transaction signature format" }, { status: 400 });
    }
    if (!checkRateLimit(walletAddress)) {
      return NextResponse.json({ error: "Rate limit exceeded: max 10 bets per hour" }, { status: 429 });
    }

    const round = await prisma.round.findUnique({ where: { id: roundId } });
    if (!round) return NextResponse.json({ error: "Round not found" }, { status: 404 });

    const validationError = validateRoundAndSide(round, side);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

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

    const odds = await updatePoolAndGetOdds(round, side, amount);

    const bet = await prisma.bet.create({
      data: { walletAddress, roundId, side, amount, odds, txHash, status, currency: "SOL" },
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
