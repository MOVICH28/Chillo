"use client";
import { useState, useEffect, useRef } from "react";

export interface CryptoData {
  price: number;
  change24h: number;
  sparkline: number[]; // 25 hourly points (24h)
}

export interface PumpFunData {
  volume24h: number;       // current volume in millions
  volumeTarget: number;    // 200
  topAth: number;          // highest token MC today in millions
  tokensAbove1M: number;
  totalTokens: number;     // all-time tokens launched
  newTokensToday: number;  // tokens launched today
}

export interface LiveData {
  btc: CryptoData | null;
  sol: CryptoData | null;
  pumpfun: PumpFunData | null;
  lastUpdated: number;
}

/** Synthetic sparkline seeded per-day so it's stable within a day */
function makeSparkline(currentPrice: number, change24h: number): number[] {
  const startPrice = currentPrice / (1 + change24h / 100);
  // Seed changes daily so sparkline shape shifts day to day but is stable within 30s refreshes
  let seed = Math.floor(Date.now() / 86400000) * 997 + 42;
  const rng = () => {
    seed = ((seed * 1664525 + 1013904223) | 0) >>> 0;
    return seed / 0xffffffff;
  };
  const pts: number[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    // Smooth S-curve trend
    const ease = t * t * (3 - 2 * t);
    const trend = startPrice + (currentPrice - startPrice) * ease;
    const noise = trend * 0.008 * (rng() - 0.5);
    pts.push(i === 24 ? currentPrice : trend + noise);
  }
  return pts;
}

function initPumpFun(): PumpFunData {
  const now = new Date();
  const hoursElapsed = now.getHours() + now.getMinutes() / 60;
  // All-time base: ~4.8M tokens ever, growing ~2800/day
  const dayOfYear = Math.floor(Date.now() / 86400000) - 19700; // rough epoch days
  const allTimeBase = 4_800_000 + dayOfYear * 2800;
  return {
    volume24h: parseFloat(Math.min(20 + hoursElapsed * 7.2, 194).toFixed(1)),
    volumeTarget: 200,
    topAth: parseFloat(Math.min(1.2 + hoursElapsed * 0.22, 9.5).toFixed(2)),
    tokensAbove1M: Math.max(1, Math.floor(hoursElapsed / 2.8)),
    totalTokens: allTimeBase + Math.floor(hoursElapsed * 120),
    newTokensToday: Math.floor(hoursElapsed * 120),
  };
}

function tickPumpFun(prev: PumpFunData): PumpFunData {
  const volumeBump = 0.4 + Math.random() * 1.1;
  const athBump = Math.random() < 0.12 ? Math.random() * 0.25 : 0;
  const tokenBump = Math.random() < 0.06 ? 1 : 0;
  // ~1 new token every 8 seconds = ~3-4 per 30s tick
  const newLaunched = 3 + Math.floor(Math.random() * 3);
  return {
    volume24h: parseFloat(Math.min(prev.volume24h + volumeBump, 198.8).toFixed(1)),
    volumeTarget: 200,
    topAth: parseFloat(Math.min(prev.topAth + athBump, 9.99).toFixed(2)),
    tokensAbove1M: Math.min(prev.tokensAbove1M + tokenBump, 30),
    totalTokens: prev.totalTokens + newLaunched,
    newTokensToday: prev.newTokensToday + newLaunched,
  };
}

export function useLiveData(): { data: LiveData; loading: boolean } {
  const pumpRef = useRef<PumpFunData>(initPumpFun());
  const [data, setData] = useState<LiveData>({
    btc: null,
    sol: null,
    pumpfun: pumpRef.current,
    lastUpdated: 0,
  });
  const [loading, setLoading] = useState(true);

  async function refresh() {
    // Advance pump.fun simulation
    pumpRef.current = tickPumpFun(pumpRef.current);

    let btc: CryptoData | null = null;
    let sol: CryptoData | null = null;
    try {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,solana&vs_currencies=usd&include_24hr_change=true",
        { cache: "no-store" }
      );
      if (res.ok) {
        const json = await res.json();
        btc = {
          price: json.bitcoin?.usd ?? 0,
          change24h: json.bitcoin?.usd_24h_change ?? 0,
          sparkline: makeSparkline(json.bitcoin?.usd ?? 0, json.bitcoin?.usd_24h_change ?? 0),
        };
        sol = {
          price: json.solana?.usd ?? 0,
          change24h: json.solana?.usd_24h_change ?? 0,
          sparkline: makeSparkline(json.solana?.usd ?? 0, json.solana?.usd_24h_change ?? 0),
        };
      }
    } catch {
      // Network error – keep previous crypto values if any
    }

    setData((prev) => ({
      btc: btc ?? prev.btc,
      sol: sol ?? prev.sol,
      pumpfun: pumpRef.current,
      lastUpdated: Date.now(),
    }));
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { data, loading };
}
