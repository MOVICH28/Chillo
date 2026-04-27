import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// Well-known token fallbacks (symbol → CoinGecko image)
const KNOWN_TOKENS: Record<string, { name: string; symbol: string; logoUrl: string; cgId: string }> = {
  BTC:  { name: "Bitcoin",  symbol: "BTC",  logoUrl: "https://assets.coingecko.com/coins/images/1/small/bitcoin.png",  cgId: "bitcoin" },
  SOL:  { name: "Solana",   symbol: "SOL",  logoUrl: "https://assets.coingecko.com/coins/images/4128/small/solana.png", cgId: "solana" },
  ETH:  { name: "Ethereum", symbol: "ETH",  logoUrl: "https://assets.coingecko.com/coins/images/279/small/ethereum.png", cgId: "ethereum" },
  BNB:  { name: "BNB",      symbol: "BNB",  logoUrl: "https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png", cgId: "binancecoin" },
  DOGE: { name: "Dogecoin", symbol: "DOGE", logoUrl: "https://assets.coingecko.com/coins/images/5/small/dogecoin.png",  cgId: "dogecoin" },
};

async function fetchDexScreener(query: string, isAddress: boolean) {
  const url = isAddress
    ? `https://api.dexscreener.com/latest/dex/tokens/${query}`
    : `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`;

  const res = await fetch(url, { next: { revalidate: 30 } });
  if (!res.ok) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();
  const pairs: any[] = data?.pairs ?? [];
  if (pairs.length === 0) return null;

  // Sort by volume to get the most liquid pair
  pairs.sort((a, b) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0));
  const pair = pairs[0];

  const isPumpFun =
    pair.dexId === "pump_amm" ||
    (pair.dexId ?? "").toLowerCase().includes("pump") ||
    (pair.url ?? "").toLowerCase().includes("pump.fun") ||
    (pair.labels ?? []).some((l: string) => l.toLowerCase().includes("pump"));

  return {
    name:          pair.baseToken?.name    ?? query,
    symbol:        pair.baseToken?.symbol  ?? query.toUpperCase(),
    priceUsd:      parseFloat(pair.priceUsd ?? "0"),
    mcapUsd:       pair.marketCap ?? pair.fdv ?? 0,
    priceChange24h: pair.priceChange?.h24  ?? 0,
    volume24h:     pair.volume?.h24        ?? 0,
    change5m:      pair.priceChange?.m5    ?? null,
    change1h:      pair.priceChange?.h1    ?? null,
    change6h:      pair.priceChange?.h6    ?? null,
    change24h:     pair.priceChange?.h24   ?? null,
    logoUrl:       pair.info?.imageUrl     ?? null,
    address:       pair.baseToken?.address ?? query,
    isPumpFun,
  };
}

async function fetchCoinGeckoData(cgId: string): Promise<{ price: number; mcapUsd: number } | null> {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=usd&include_market_cap=true`,
      { next: { revalidate: 30 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const entry = data[cgId];
    if (!entry) return null;
    return { price: entry.usd ?? 0, mcapUsd: entry.usd_market_cap ?? 0 };
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.trim() ?? "";
  if (!address) return NextResponse.json({ error: "address required" }, { status: 400 });

  const upper = address.toUpperCase();

  // Well-known symbol shortcut
  if (KNOWN_TOKENS[upper]) {
    const known = KNOWN_TOKENS[upper];
    const cg = await fetchCoinGeckoData(known.cgId);
    return NextResponse.json({
      name:          known.name,
      symbol:        known.symbol,
      priceUsd:      cg?.price ?? 0,
      mcapUsd:       cg?.mcapUsd ?? 0,
      priceChange24h: 0,
      volume24h:     0,
      logoUrl:       known.logoUrl,
      address:       upper,
      isPumpFun:     false,
    });
  }

  const isAddress = BASE58_RE.test(address);

  try {
    const result = await fetchDexScreener(address, isAddress);
    if (!result) return NextResponse.json({ error: "Token not found" }, { status: 404 });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
