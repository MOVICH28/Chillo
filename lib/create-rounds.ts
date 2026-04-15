import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { Outcome } from "@/lib/types";

const ROUND_DURATION_MS = 24 * 60 * 60 * 1000;
const BETTING_CLOSES_BEFORE_END_MS = 5 * 60 * 1000; // 5 min before end

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

async function roundExistsToday(category: string, targetToken?: string): Promise<boolean> {
  const oneDayAgo = new Date(Date.now() - ROUND_DURATION_MS);
  const count = await prisma.round.count({
    where: {
      category,
      ...(targetToken ? { targetToken } : {}),
      createdAt: { gte: oneDayAgo },
    },
  });
  return count > 0;
}

/** Build 4 range outcomes centered around the current price (±2.5% bands). */
function buildRangeOutcomes(price: number, isInt: boolean): Outcome[] {
  const fmt = (n: number) => isInt ? Math.round(n) : parseFloat(n.toFixed(2));
  const lo  = fmt(price * 0.975);
  const hi  = fmt(price * 1.025);

  return [
    { id: "A", label: `Below $${lo.toLocaleString("en-US")}`,          minPrice: null, maxPrice: lo,   pool: 0 },
    { id: "B", label: `$${lo.toLocaleString("en-US")} – $${price.toLocaleString("en-US")}`,  minPrice: lo,  maxPrice: fmt(price), pool: 0 },
    { id: "C", label: `$${price.toLocaleString("en-US")} – $${hi.toLocaleString("en-US")}`,  minPrice: fmt(price), maxPrice: hi, pool: 0 },
    { id: "D", label: `Above $${hi.toLocaleString("en-US")}`,           minPrice: hi,  maxPrice: null, pool: 0 },
  ];
}

export interface CreateRoundsResult {
  created: string[];
  skipped: string[];
  errors: string[];
}

export async function createDailyRounds(): Promise<CreateRoundsResult> {
  const endsAt          = new Date(Date.now() + ROUND_DURATION_MS);
  const bettingClosesAt = new Date(endsAt.getTime() - BETTING_CLOSES_BEFORE_END_MS);
  const created: string[] = [];
  const skipped: string[] = [];
  const errors: string[]  = [];

  // ── Crypto range rounds ────────────────────────────────────────────────────
  const prices = await fetchCryptoPrices();
  if (!prices) {
    errors.push("Failed to fetch crypto prices");
  } else {
    // BTC
    if (await roundExistsToday("crypto", "bitcoin")) {
      skipped.push("btc");
    } else {
      const btcPrice    = Math.round(prices.btc);
      const btcOutcomes = buildRangeOutcomes(btcPrice, true);
      await prisma.round.create({
        data: {
          question:       "Where will Bitcoin's price be in 24 hours?",
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
    if (await roundExistsToday("crypto", "solana")) {
      skipped.push("sol");
    } else {
      const solPrice    = parseFloat(prices.sol.toFixed(2));
      const solOutcomes = buildRangeOutcomes(solPrice, false);
      await prisma.round.create({
        data: {
          question:       "Where will Solana's price be in 24 hours?",
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

  // ── pump.fun 3-token round (YES/NO stays) ──────────────────────────────────
  if (await roundExistsToday("pumpfun")) {
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
        question:  `Will ${tickers} reach $1M market cap in 24 hours?`,
        category:  "pumpfun",
        tokenList,
        yesPool:   BASE_POOL,
        noPool:    BASE_POOL,
        totalPool: BASE_POOL * 2,
        status:    "open",
        endsAt,
      },
    });
    created.push("pumpfun");
  }

  return { created, skipped, errors };
}
