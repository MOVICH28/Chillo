import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { Outcome } from "@/lib/types";

const ROUND_DURATION_MS            = 15 * 60 * 1000; // 15 min total
const BETTING_CLOSES_BEFORE_END_MS =  5 * 60 * 1000; // betting closes at +10 min (5 min before end)
const ROUND_CREATION_INTERVAL_MS   = 10 * 60 * 1000; // new round every 10 min exactly

async function fetchCryptoPrices(): Promise<{ btc: number; sol: number } | null> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,solana&vs_currencies=usd",
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.bitcoin?.usd || !json.solana?.usd) return null;
    return { btc: json.bitcoin.usd, sol: json.solana.usd };
  } catch {
    return null;
  }
}

/**
 * Skip creation if a round for this token was already created within the last
 * ROUND_CREATION_INTERVAL_MS (10 min). This allows overlapping rounds:
 * one open for betting and one waiting for its result can coexist.
 */
async function roundCreatedRecently(targetToken: string): Promise<boolean> {
  const since = new Date(Date.now() - ROUND_CREATION_INTERVAL_MS);
  const found = await prisma.round.findFirst({
    where: { targetToken, createdAt: { gte: since } },
  });
  return found !== null;
}

// ── BTC: 6 outcomes, $70 step, centered on current price (no rounding) ───────
function buildBtcOutcomes(price: number): Outcome[] {
  const p    = Math.round(price); // drop decimals only
  const step = 70;
  const fmt  = (n: number) => `$${n.toLocaleString("en-US")}`;

  return [
    { id: "A", label: `Below ${fmt(p - step * 2)}`,                      minPrice: 0,              maxPrice: p - step * 2, pool: 0 },
    { id: "B", label: `${fmt(p - step * 2)} – ${fmt(p - step)}`,         minPrice: p - step * 2,   maxPrice: p - step,     pool: 0 },
    { id: "C", label: `${fmt(p - step)} – ${fmt(p)}`,                    minPrice: p - step,       maxPrice: p,            pool: 0 },
    { id: "D", label: `${fmt(p)} – ${fmt(p + step)}`,                    minPrice: p,              maxPrice: p + step,     pool: 0 },
    { id: "E", label: `${fmt(p + step)} – ${fmt(p + step * 2)}`,         minPrice: p + step,       maxPrice: p + step * 2, pool: 0 },
    { id: "F", label: `Above ${fmt(p + step * 2)}`,                      minPrice: p + step * 2,   maxPrice: 9_999_999,    pool: 0 },
  ];
}

// ── SOL: 6 outcomes, $0.10 step, centered on exact current price ─────────────
function buildSolOutcomes(price: number): Outcome[] {
  const p    = parseFloat(price.toFixed(2)); // exact price, no rounding
  const step = 0.10;

  return [
    { id: "A", label: `Below $${(p - step * 2).toFixed(2)}`,                                           minPrice: 0,                          maxPrice: parseFloat((p - step * 2).toFixed(2)), pool: 0 },
    { id: "B", label: `$${(p - step * 2).toFixed(2)} – $${(p - step).toFixed(2)}`,                    minPrice: parseFloat((p - step * 2).toFixed(2)), maxPrice: parseFloat((p - step).toFixed(2)),   pool: 0 },
    { id: "C", label: `$${(p - step).toFixed(2)} – $${p.toFixed(2)}`,                                  minPrice: parseFloat((p - step).toFixed(2)),     maxPrice: p,                                   pool: 0 },
    { id: "D", label: `$${p.toFixed(2)} – $${(p + step).toFixed(2)}`,                                  minPrice: p,                          maxPrice: parseFloat((p + step).toFixed(2)),   pool: 0 },
    { id: "E", label: `$${(p + step).toFixed(2)} – $${(p + step * 2).toFixed(2)}`,                    minPrice: parseFloat((p + step).toFixed(2)),     maxPrice: parseFloat((p + step * 2).toFixed(2)), pool: 0 },
    { id: "F", label: `Above $${(p + step * 2).toFixed(2)}`,                                           minPrice: parseFloat((p + step * 2).toFixed(2)), maxPrice: 9_999,                                pool: 0 },
  ];
}

export interface CreateRoundsResult {
  created: string[];
  skipped: string[];
  errors: string[];
}

export async function createDailyRounds(): Promise<CreateRoundsResult> {
  const now             = Date.now();
  const endsAt          = new Date(now + ROUND_DURATION_MS);
  const bettingClosesAt = new Date(now + ROUND_DURATION_MS - BETTING_CLOSES_BEFORE_END_MS);
  const created: string[] = [];
  const skipped: string[] = [];
  const errors: string[]  = [];

  // ── Crypto range rounds ────────────────────────────────────────────────────
  const prices = await fetchCryptoPrices();
  if (!prices) {
    errors.push("Failed to fetch crypto prices");
  } else {
    // Get global round count once for sequential numbering
    const totalCount = await prisma.round.count();
    let nextNumber = totalCount + 1;

    // BTC
    if (await roundCreatedRecently("bitcoin")) {
      skipped.push("btc");
    } else {
      const btcPrice    = Math.round(prices.btc);
      const btcOutcomes = buildBtcOutcomes(btcPrice);
      await prisma.round.create({
        data: {
          question:       "Where will Bitcoin's price be in 15 minutes?",
          category:       "crypto",
          targetToken:    "bitcoin",
          targetPrice:    btcPrice,
          yesPool:        0,
          noPool:         0,
          totalPool:      0,
          status:         "open",
          endsAt,
          bettingClosesAt,
          outcomes:       btcOutcomes as unknown as Prisma.InputJsonValue,
          roundNumber:    nextNumber++,
        },
      });
      created.push("btc");
    }

    // SOL
    if (await roundCreatedRecently("solana")) {
      skipped.push("sol");
    } else {
      const solPrice    = parseFloat(prices.sol.toFixed(2));
      const solOutcomes = buildSolOutcomes(solPrice);
      await prisma.round.create({
        data: {
          question:       "Where will Solana's price be in 15 minutes?",
          category:       "crypto",
          targetToken:    "solana",
          targetPrice:    solPrice,
          yesPool:        0,
          noPool:         0,
          totalPool:      0,
          status:         "open",
          endsAt,
          bettingClosesAt,
          outcomes:       solOutcomes as unknown as Prisma.InputJsonValue,
          roundNumber:    nextNumber++,
        },
      });
      created.push("sol");
    }
  }

  // ── pump.fun rounds disabled — external API unreliable ───────────────────────
  // TODO: re-enable when a stable data source is available
  skipped.push("pumpfun");

  return { created, skipped, errors };
}
