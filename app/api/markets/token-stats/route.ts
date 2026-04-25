import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const KNOWN: Record<string, { cgId: string; binance: string }> = {
  bitcoin: { cgId: "bitcoin", binance: "BTCUSDT" },
  solana:  { cgId: "solana",  binance: "SOLUSDT" },
  btc:     { cgId: "bitcoin", binance: "BTCUSDT" },
  sol:     { cgId: "solana",  binance: "SOLUSDT" },
};

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

async function binanceTicker(symbol: string) {
  const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`, {
    next: { revalidate: 30 },
  });
  if (!res.ok) return null;
  return res.json();
}

async function binanceKlineChange(symbol: string, interval: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=2`,
      { next: { revalidate: 30 } }
    );
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any[][] = await res.json();
    if (c.length < 2) return null;
    const open  = parseFloat(c[0][1]);
    const close = parseFloat(c[1][4]);
    return open ? ((close - open) / open) * 100 : null;
  } catch { return null; }
}

async function coinGeckoMcap(cgId: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=usd&include_market_cap=true`,
      { next: { revalidate: 120 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data[cgId]?.usd_market_cap ?? null;
  } catch { return null; }
}

async function dexScreenerPair(query: string) {
  const isAddr = BASE58_RE.test(query);
  const url    = isAddr
    ? `https://api.dexscreener.com/latest/dex/tokens/${query}`
    : `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, { next: { revalidate: 30 } });
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    const pairs: any[] = data.pairs ?? [];
    if (!pairs.length) return null;
    pairs.sort((a, b) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0));
    return pairs[0];
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const targetToken  = req.nextUrl.searchParams.get("targetToken")?.toLowerCase().trim() ?? "";
  const tokenAddress = req.nextUrl.searchParams.get("tokenAddress")?.trim() ?? "";
  const tokenSymbol  = req.nextUrl.searchParams.get("tokenSymbol")?.trim()  ?? "";

  const known = KNOWN[targetToken];

  if (known) {
    const [ticker, m5, h1, h6, marketCap] = await Promise.all([
      binanceTicker(known.binance),
      binanceKlineChange(known.binance, "5m"),
      binanceKlineChange(known.binance, "1h"),
      binanceKlineChange(known.binance, "6h"),
      coinGeckoMcap(known.cgId),
    ]);

    if (!ticker) return NextResponse.json({ error: "Binance unavailable" }, { status: 502 });

    return NextResponse.json({
      priceUsd:  parseFloat(ticker.lastPrice),
      marketCap,
      volume24h: parseFloat(ticker.quoteVolume),
      priceChange: {
        m5,
        h1,
        h6,
        h24: parseFloat(ticker.priceChangePercent),
      },
      symbol: targetToken === "bitcoin" ? "BTC" : "SOL",
    });
  }

  // Custom token: DexScreener
  const query = tokenAddress || tokenSymbol;
  if (!query) return NextResponse.json({ error: "Missing token params" }, { status: 400 });

  const pair = await dexScreenerPair(query);
  if (!pair) return NextResponse.json({ error: "Token not found" }, { status: 404 });

  return NextResponse.json({
    priceUsd:  parseFloat(pair.priceUsd ?? "0"),
    marketCap: pair.marketCap ?? pair.fdv ?? null,
    volume24h: pair.volume?.h24 ?? null,
    priceChange: {
      m5:  pair.priceChange?.m5  ?? null,
      h1:  pair.priceChange?.h1  ?? null,
      h6:  pair.priceChange?.h6  ?? null,
      h24: pair.priceChange?.h24 ?? null,
    },
    symbol: pair.baseToken?.symbol ?? (tokenSymbol || query.slice(0, 8)),
  });
}
