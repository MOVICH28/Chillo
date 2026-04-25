"use client";

import { useState, useEffect, useRef } from "react";

interface Stats {
  priceUsd:    number;
  marketCap:   number | null;
  volume24h:   number | null;
  priceChange: { m5: number | null; h1: number | null; h6: number | null; h24: number | null };
  symbol:      string;
}

const CG_IDS: Record<string, string> = {
  bitcoin: "bitcoin", solana: "solana",
  btc:     "bitcoin", sol:    "solana",
};

async function fetchCoinGecko(cgId: string): Promise<Stats | null> {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=usd` +
      `&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const d = data[cgId];
    if (!d) return null;
    return {
      priceUsd:  d.usd,
      marketCap: d.usd_market_cap   ?? null,
      volume24h: d.usd_24h_vol      ?? null,
      priceChange: { m5: null, h1: null, h6: null, h24: d.usd_24h_change ?? null },
      symbol: cgId === "bitcoin" ? "BTC" : "SOL",
    };
  } catch { return null; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchDexScreener(address: string): Promise<Stats | null> {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${address}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pairs: any[] = data.pairs ?? [];
    if (!pairs.length) return null;
    pairs.sort((a, b) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0));
    const pair = pairs[0];
    return {
      priceUsd:  parseFloat(pair.priceUsd ?? "0"),
      marketCap: pair.marketCap ?? pair.fdv ?? null,
      volume24h: pair.volume?.h24 ?? null,
      priceChange: {
        m5:  pair.priceChange?.m5  ?? null,
        h1:  pair.priceChange?.h1  ?? null,
        h6:  pair.priceChange?.h6  ?? null,
        h24: pair.priceChange?.h24 ?? null,
      },
      symbol: pair.baseToken?.symbol ?? address.slice(0, 8),
    };
  } catch { return null; }
}

function fmtLarge(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3)  return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtPrice(p: number): string {
  if (p >= 1000) return `$${Math.round(p).toLocaleString("en-US")}`;
  if (p >= 1)    return `$${p.toFixed(4)}`;
  if (p >= 0.01) return `$${p.toFixed(6)}`;
  return `$${p.toFixed(8)}`;
}

function Change({ v, label }: { v: number | null; label: string }) {
  return (
    <div className="flex flex-col items-center min-w-[34px]">
      <span className="text-[9px] text-white/25 mb-0.5 uppercase tracking-wider">{label}</span>
      {v == null ? (
        <span className="text-[11px] text-white/20">—</span>
      ) : (
        <span className={`text-[11px] font-semibold tabular-nums ${v >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
          {v >= 0 ? "+" : ""}{v.toFixed(2)}%
        </span>
      )}
    </div>
  );
}

interface Props {
  targetToken?:  string | null;
  tokenAddress?: string | null;
  tokenSymbol?:  string | null;
}

export default function TokenStats({ targetToken, tokenAddress, tokenSymbol }: Props) {
  const [stats, setStats]     = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  // Local price history for CoinGecko tokens (BTC/SOL) — API only returns 24h change
  const priceHistory               = useRef<{ time: number; price: number }[]>([]);
  const [localChange5m, setLocal5m] = useState<number | null>(null);
  const [localChange1h, setLocal1h] = useState<number | null>(null);
  const [localChange6h, setLocal6h] = useState<number | null>(null);

  const sym       = (targetToken ?? tokenSymbol ?? "").toLowerCase();
  const cgId      = CG_IDS[sym] ?? null;
  const isCoinGecko = !!cgId;

  // Fetch stats on mount and every 10s
  useEffect(() => {
    const addr = tokenAddress ?? null;
    if (!cgId && !addr) { setLoading(false); return; }

    // Reset local history when token changes
    priceHistory.current = [];
    setLocal5m(null);
    setLocal1h(null);
    setLocal6h(null);

    let cancelled = false;

    async function load() {
      const result = cgId
        ? await fetchCoinGecko(cgId)
        : await fetchDexScreener(addr!);
      if (cancelled) return;
      if (result) setStats(result);
      setLoading(false);
    }

    load();
    const id = setInterval(load, 10_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [targetToken, tokenAddress, tokenSymbol]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build local price history for CoinGecko tokens to derive 5m / 1h / 6h changes
  useEffect(() => {
    if (!stats?.priceUsd || !isCoinGecko) return;

    const now   = Date.now();
    const price = stats.priceUsd;

    priceHistory.current.push({ time: now, price });
    // Keep only last 6 hours
    priceHistory.current = priceHistory.current.filter(p => now - p.time < 6 * 60 * 60 * 1000);

    const price5m = priceHistory.current.find(p => now - p.time >= 5  * 60 * 1000);
    const price1h = priceHistory.current.find(p => now - p.time >= 60 * 60 * 1000);
    const price6h = priceHistory.current.find(p => now - p.time >= 6  * 60 * 60 * 1000);

    setLocal5m(price5m ? (price - price5m.price) / price5m.price * 100 : null);
    setLocal1h(price1h ? (price - price1h.price) / price1h.price * 100 : null);
    setLocal6h(price6h ? (price - price6h.price) / price6h.price * 100 : null);
  }, [stats?.priceUsd]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!targetToken && !tokenAddress && !tokenSymbol) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-4 px-3 py-2 rounded-lg border border-white/5 mb-2 animate-pulse"
           style={{ background: "#0d0f14" }}>
        {[72, 56, 56, 32, 32, 32, 32].map((w, i) => (
          <div key={i} className="h-6 bg-white/5 rounded" style={{ width: w }} />
        ))}
      </div>
    );
  }

  if (!stats) return null;

  // For CoinGecko: use locally-calculated changes (API only provides 24h)
  // For DexScreener: use changes returned directly from the API
  const change5m  = isCoinGecko ? localChange5m          : stats.priceChange.m5;
  const change1h  = isCoinGecko ? localChange1h          : stats.priceChange.h1;
  const change6h  = isCoinGecko ? localChange6h          : stats.priceChange.h6;
  const change24h = stats.priceChange.h24;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-2 rounded-lg border border-white/5 mb-2"
         style={{ background: "#0d0f14" }}>
      {/* Market cap — primary stat */}
      <div className="flex flex-col">
        <span className="text-[9px] text-white/25 mb-0.5 uppercase tracking-wider">Mkt Cap</span>
        <span className="text-white font-mono font-bold text-xl leading-tight">{fmtLarge(stats.marketCap)}</span>
      </div>

      <span className="hidden sm:block w-px h-8 bg-white/8 shrink-0" />

      {/* Price */}
      <div className="flex flex-col">
        <span className="text-[9px] text-white/25 mb-0.5 uppercase tracking-wider">Price</span>
        <span className="text-white/80 text-sm font-mono font-semibold">{fmtPrice(stats.priceUsd)}</span>
      </div>

      {/* Volume */}
      <div className="flex flex-col">
        <span className="text-[9px] text-white/25 mb-0.5 uppercase tracking-wider">Vol 24h</span>
        <span className="text-white/60 text-xs font-mono">{fmtLarge(stats.volume24h)}</span>
      </div>

      <span className="hidden sm:block w-px h-8 bg-white/8 shrink-0" />

      <Change v={change5m}  label="5m"  />
      <Change v={change1h}  label="1h"  />
      <Change v={change6h}  label="6h"  />
      <Change v={change24h} label="24h" />
    </div>
  );
}
