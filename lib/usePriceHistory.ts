"use client";

import { useState, useEffect, useRef } from "react";

export interface PricePoint {
  time: number;  // ms timestamp
  price: number;
}

const MAX_POINTS = 30; // 5 minutes at 10s interval
const FETCH_MS   = 10_000;

async function fetchPrice(token: "bitcoin" | "solana"): Promise<number | null> {
  // Try CoinGecko first
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${token}&vs_currencies=usd`,
      { cache: "no-store" }
    );
    if (res.ok) {
      const json = await res.json();
      const price = json[token]?.usd;
      if (price) return price;
    }
  } catch { /* fall through */ }

  // Fallback: CoinPaprika
  try {
    const id  = token === "bitcoin" ? "btc-bitcoin" : "sol-solana";
    const res = await fetch(`https://api.coinpaprika.com/v1/tickers/${id}`, { cache: "no-store" });
    if (res.ok) {
      const json = await res.json();
      const price = json.quotes?.USD?.price;
      if (price) return price;
    }
  } catch { /* give up */ }

  return null;
}

/** Keeps a rolling 30-point (5-min) price history for the given token, updated every 10s. */
export function usePriceHistory(token: "bitcoin" | "solana"): PricePoint[] {
  const [history, setHistory] = useState<PricePoint[]>([]);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      const price = await fetchPrice(tokenRef.current);
      if (cancelled || price === null) return;
      setHistory(prev => {
        const next = [...prev, { time: Date.now(), price }];
        return next.length > MAX_POINTS ? next.slice(-MAX_POINTS) : next;
      });
    }

    tick();
    const id = setInterval(tick, FETCH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [token]);

  return history;
}
