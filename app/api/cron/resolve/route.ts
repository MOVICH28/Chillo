import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveRound } from "@/lib/resolve";
import { createDailyRounds } from "@/lib/create-rounds";

// ─── Price fetching ───────────────────────────────────────────────────────────

interface CoinGeckoPrices {
  bitcoin?: { usd: number };
  solana?:  { usd: number };
}

async function fetchCryptoPrices(): Promise<CoinGeckoPrices> {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,solana&vs_currencies=usd",
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error(`CoinGecko error: ${res.status}`);
  return res.json();
}

async function fetchPumpFunTopMcap(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://api.dexscreener.com/latest/dex/tokens/pump?rankBy=marketCap&order=desc&limit=10",
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    const pairs: { fdv?: number; marketCap?: number }[] = data?.pairs ?? [];
    if (pairs.length === 0) return null;
    return Math.max(...pairs.map((p) => p.marketCap ?? p.fdv ?? 0));
  } catch {
    return null;
  }
}

// ─── Winner determination ─────────────────────────────────────────────────────

async function determineWinner(round: {
  id: string;
  question: string;
  category: string;
  targetPrice: number | null;
  targetToken: string | null;
  tokenList: string | null;
}): Promise<"yes" | "no" | null> {
  // Crypto: use stored targetToken + targetPrice — no regex needed
  if (round.category === "crypto" && round.targetToken && round.targetPrice) {
    let prices: CoinGeckoPrices;
    try {
      prices = await fetchCryptoPrices();
    } catch (err) {
      console.warn(`[cron] ${round.id}: price fetch failed`, err);
      return null;
    }
    const current =
      round.targetToken === "bitcoin"
        ? prices.bitcoin?.usd
        : prices.solana?.usd;
    if (!current) return null;
    console.log(`[cron] ${round.id}: resolving crypto round`);
    return current >= round.targetPrice ? "yes" : "no";
  }

  // pump.fun: check top market cap across all tokens
  if (round.category === "pumpfun") {
    const topMcap = await fetchPumpFunTopMcap();
    if (topMcap === null) {
      console.warn(`[cron] ${round.id}: pump.fun mcap data unavailable`);
      return null;
    }
    console.log(`[cron] pump.fun mcap data fetched`);
    return topMcap >= 1_000_000 ? "yes" : "no";
  }

  console.warn(`[cron] ${round.id}: no resolution rule matched for "${round.question}"`);
  return null;
}

// ─── Cron handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // ── Step 1: create fresh daily rounds ───────────────────────────────────────
  const createResult = await createDailyRounds();
  console.log("[cron] createDailyRounds:", createResult);

  // ── Step 2: resolve ended open rounds ───────────────────────────────────────
  const endedRounds = await prisma.round.findMany({
    where: { status: "open", endsAt: { lte: now } },
  });

  const summary: {
    roundId: string;
    status: "resolved" | "skipped" | "no_data" | "error";
    winner?: string;
    detail?: string;
  }[] = [];

  for (const round of endedRounds) {
    let winner: "yes" | "no" | null;
    try {
      winner = await determineWinner(round);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[cron] ${round.id} determineWinner error:`, msg);
      summary.push({ roundId: round.id, status: "error", detail: msg });
      continue;
    }

    if (winner === null) {
      summary.push({ roundId: round.id, status: "no_data", detail: "could not fetch external data" });
      continue;
    }

    try {
      await resolveRound(round.id, winner);
      summary.push({ roundId: round.id, status: "resolved", winner });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[cron] ${round.id} resolveRound error:`, msg);
      summary.push({ roundId: round.id, status: "error", detail: msg });
    }
  }

  return NextResponse.json({
    ran_at: now.toISOString(),
    rounds_created: createResult,
    rounds_resolved: summary,
  });
}
