import { prisma } from "@/lib/prisma";

const BASE_POOL = 1; // base SOL per side — small enough that real bets visibly move odds
const ROUND_DURATION_MS = 24 * 60 * 60 * 1000;

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

export interface CreateRoundsResult {
  created: string[];
  skipped: string[];
  errors: string[];
}

export async function createDailyRounds(): Promise<CreateRoundsResult> {
  const endsAt = new Date(Date.now() + ROUND_DURATION_MS);
  const created: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  // ── Crypto rounds ──────────────────────────────────────────────────────────
  const prices = await fetchCryptoPrices();
  if (!prices) {
    errors.push("Failed to fetch crypto prices");
  } else {
    // BTC
    if (await roundExistsToday("crypto", "bitcoin")) {
      skipped.push("btc");
    } else {
      const btcTarget = Math.round(prices.btc * 1.025);
      await prisma.round.create({
        data: {
          question: `Will Bitcoin exceed $${btcTarget.toLocaleString()} in 24 hours?`,
          category: "crypto",
          targetToken: "bitcoin",
          targetPrice: btcTarget,
          yesPool: BASE_POOL,
          noPool: BASE_POOL,
          totalPool: BASE_POOL * 2,
          status: "open",
          endsAt,
        },
      });
      created.push("btc");
    }

    // SOL
    if (await roundExistsToday("crypto", "solana")) {
      skipped.push("sol");
    } else {
      const solTarget = parseFloat((prices.sol * 1.025).toFixed(2));
      await prisma.round.create({
        data: {
          question: `Will Solana exceed $${solTarget} in 24 hours?`,
          category: "crypto",
          targetToken: "solana",
          targetPrice: solTarget,
          yesPool: BASE_POOL,
          noPool: BASE_POOL,
          totalPool: BASE_POOL * 2,
          status: "open",
          endsAt,
        },
      });
      created.push("sol");
    }
  }

  // ── pump.fun 3-token round ─────────────────────────────────────────────────
  if (await roundExistsToday("pumpfun")) {
    skipped.push("pumpfun");
  } else {
    const tokens = await fetchRecentPumpTokens();
    let tickers: string;
    let tokenList: string;

    if (tokens.length >= 3) {
      tickers = tokens.map((t) => `$${t.symbol}`).join(", ");
      tokenList = JSON.stringify(tokens.map((t) => t.address));
    } else {
      tickers = "any new pump.fun token";
      tokenList = JSON.stringify([]);
    }

    await prisma.round.create({
      data: {
        question: `Will ${tickers} reach $1M market cap in 24 hours?`,
        category: "pumpfun",
        tokenList,
        yesPool: BASE_POOL,
        noPool: BASE_POOL,
        totalPool: BASE_POOL * 2,
        status: "open",
        endsAt,
      },
    });
    created.push("pumpfun");
  }

  return { created, skipped, errors };
}
