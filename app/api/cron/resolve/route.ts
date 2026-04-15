import { NextRequest, NextResponse } from "next/server";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { prisma } from "@/lib/prisma";
import { Outcome } from "@/lib/types";

export const dynamic = "force-dynamic";
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

type RoundRow = {
  id: string;
  question: string;
  category: string;
  targetPrice: number | null;
  targetToken: string | null;
  tokenList: string | null;
  outcomes: unknown; // Prisma.JsonValue | null
};

/** For range rounds: find which outcome bracket the current price falls into. */
function determineRangeOutcome(round: RoundRow, prices: CoinGeckoPrices): string | null {
  const current =
    round.targetToken === "bitcoin" ? prices.bitcoin?.usd :
    round.targetToken === "solana"  ? prices.solana?.usd  : undefined;
  if (!current) return null;

  const outcomes = round.outcomes as Outcome[];
  for (const o of outcomes) {
    const aboveMin = o.minPrice === null || current >= o.minPrice;
    const belowMax = o.maxPrice === null || current <  o.maxPrice;
    if (aboveMin && belowMax) return o.id;
  }
  // Fallback: last outcome if nothing matched (price exactly at upper boundary)
  return outcomes[outcomes.length - 1]?.id ?? null;
}

/** For yes/no rounds: return "yes" | "no" | null */
async function determineYesNoWinner(
  round: RoundRow,
  prices: CoinGeckoPrices,
): Promise<"yes" | "no" | null> {
  if (round.category === "crypto" && round.targetToken && round.targetPrice) {
    const current =
      round.targetToken === "bitcoin"
        ? prices.bitcoin?.usd
        : prices.solana?.usd;
    if (!current) return null;
    console.log(`[cron] ${round.id}: resolving yes/no crypto round`);
    return current >= round.targetPrice ? "yes" : "no";
  }

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

async function runCron(): Promise<NextResponse> {
  const now = new Date();

  // ── Step 1: create fresh daily rounds ───────────────────────────────────────
  const createResult = await createDailyRounds();
  console.log("[cron] createDailyRounds:", createResult);

  // ── Step 2: resolve ended open rounds ───────────────────────────────────────
  const endedRounds = await prisma.round.findMany({
    where: { status: "open", endsAt: { lte: now } },
  });

  // Fetch crypto prices once — used for both range and yes/no crypto rounds
  let cryptoPrices: CoinGeckoPrices = {};
  const needsCrypto = endedRounds.some(r => r.category === "crypto");
  if (needsCrypto) {
    try {
      cryptoPrices = await fetchCryptoPrices();
    } catch (err) {
      console.warn("[cron] Failed to fetch crypto prices:", err instanceof Error ? err.message : err);
    }
  }

  const summary: {
    roundId: string;
    status: "resolved" | "skipped" | "no_data" | "error";
    winner?: string;
    detail?: string;
  }[] = [];

  for (const round of endedRounds) {
    let winner: string | null;

    try {
      if (round.outcomes !== null) {
        // Range round: find bracket containing current price
        winner = determineRangeOutcome(round, cryptoPrices);
        if (winner === null) {
          console.warn(`[cron] ${round.id}: could not determine range outcome (price data missing)`);
          summary.push({ roundId: round.id, status: "no_data", detail: "crypto price unavailable" });
          continue;
        }
      } else {
        // Yes/no round
        winner = await determineYesNoWinner(round, cryptoPrices);
        if (winner === null) {
          summary.push({ roundId: round.id, status: "no_data", detail: "could not fetch external data" });
          continue;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[cron] ${round.id} winner determination error:`, msg);
      summary.push({ roundId: round.id, status: "error", detail: msg });
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
    ran_at:          now.toISOString(),
    rounds_created:  createResult,
    rounds_resolved: summary,
  });
}

// Exported GET — Bearer token short-circuits for manual testing;
// all other requests go through QStash signature verification.
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") === `Bearer ${cronSecret}`) {
    return runCron();
  }

  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey    = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentSigningKey || !nextSigningKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const qstashHandler = verifySignatureAppRouter(
    () => runCron(),
    { currentSigningKey, nextSigningKey },
  );
  return qstashHandler(req);
}
