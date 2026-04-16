import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { Outcome } from "@/lib/types";

const ROUND_DURATION_MS          = 10 * 60 * 1000; // 10 min total
const BETTING_CLOSES_BEFORE_END_MS = 3 * 60 * 1000; // betting stops 3 min before end

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

interface PumpToken {
  address: string;
  symbol: string;
}

async function fetchRecentPumpTokens(): Promise<PumpToken[]> {
  try {
    const res = await fetch(
      "https://frontend-api.pump.fun/coins?offset=0&limit=10&sort=created_timestamp&order=DESC&includeNsfw=false",
      { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    const filtered = data.filter(
      (t: { symbol?: string; mint?: string }) =>
        t.symbol && t.mint && t.symbol.length <= 10
    );
    return filtered
      .slice(0, 3)
      .map((t: { mint: string; symbol: string }) => ({
        address: t.mint,
        symbol: t.symbol.toUpperCase(),
      }));
  } catch {
    return [];
  }
}

/**
 * A round is "active" if:
 *   - status is "open", OR
 *   - status is "closed" AND endsAt is in the future (not yet resolved)
 * Only create a new round if no active round exists.
 */
async function roundExistsActive(category: string, targetToken?: string): Promise<boolean> {
  const now = new Date();
  const count = await prisma.round.count({
    where: {
      category,
      ...(targetToken ? { targetToken } : {}),
      OR: [
        { status: "open" },
        { status: "closed", endsAt: { gt: now } },
      ],
    },
  });
  return count > 0;
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
    // BTC
    if (await roundExistsActive("crypto", "bitcoin")) {
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
        },
      });
      created.push("btc");
    }

    // SOL
    if (await roundExistsActive("crypto", "solana")) {
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
        },
      });
      created.push("sol");
    }
  }

  // ── pump.fun 3-token round (YES/NO) ────────────────────────────────────────
  if (await roundExistsActive("pumpfun")) {
    skipped.push("pumpfun");
  } else {
    const tokens = await fetchRecentPumpTokens();
    let tickers: string;
    let tokenList: string;

    if (tokens.length >= 3) {
      tickers   = tokens.map((t) => `$${t.symbol}`).join(", ");
      tokenList = JSON.stringify(tokens.map((t) => t.address));
    } else {
      tickers   = "any new pump.fun token";
      tokenList = JSON.stringify([]);
    }

    const BASE_POOL = 10;
    await prisma.round.create({
      data: {
        question:       `Will ${tickers} reach $1M market cap in 15 minutes?`,
        category:       "pumpfun",
        tokenList,
        yesPool:        BASE_POOL,
        noPool:         BASE_POOL,
        totalPool:      BASE_POOL * 2,
        status:         "open",
        endsAt,
        bettingClosesAt,
      },
    });
    created.push("pumpfun");
  }

  return { created, skipped, errors };
}
