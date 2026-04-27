"use client";

import { useState, useEffect } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CgData {
  volume24h:         number | null;
  change5m:          number | null;
  change1h:          number | null;
  change6h:          number | null;
  change24h:         number | null;
  circulatingSupply: number | null;
}

interface DexData {
  priceUsd:  number;
  marketCap: number | null;
  volume24h: number | null;
  change5m:  number | null;
  change1h:  number | null;
  change6h:  number | null;
  change24h: number | null;
  symbol:    string;
}

// ── Config ────────────────────────────────────────────────────────────────────

const CG_IDS: Record<string, string> = {
  bitcoin: "bitcoin", solana: "solana",
  btc:     "bitcoin", sol:    "solana",
};

const BINANCE_WS: Record<string, string> = {
  bitcoin: "btcusdt",
  solana:  "solusdt",
};

const BINANCE_REST: Record<string, string> = {
  bitcoin: "BTCUSDT",
  solana:  "SOLUSDT",
};

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtLarge(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3)  return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtPrice(p: number | null): string {
  if (p == null) return "—";
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

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  targetToken?:  string | null;
  tokenAddress?: string | null;
  tokenSymbol?:  string | null;
}

export default function TokenStats({ targetToken, tokenAddress, tokenSymbol }: Props) {
  const sym   = (targetToken ?? tokenSymbol ?? "").toLowerCase();
  const cgId  = CG_IDS[sym] ?? null;
  const isCG  = !!cgId;

  // BTC/SOL state
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [cgData,    setCgData]    = useState<CgData    | null>(null);

  // Custom token state
  const [dexData,   setDexData]   = useState<DexData | null>(null);
  const [updating,  setUpdating]  = useState(false);

  const [loading, setLoading] = useState(true);

  // Reset all state when the token changes
  useEffect(() => {
    setLivePrice(null);
    setCgData(null);
    setDexData(null);
    setLoading(true);
  }, [sym, tokenAddress]);

  // ── BTC / SOL: parallel REST load + Binance WebSocket for live ticks ────────
  useEffect(() => {
    if (!isCG || !cgId) return;

    const binanceSym  = BINANCE_WS[cgId];
    const binanceRest = BINANCE_REST[cgId];
    let cancelled     = false;
    let ws:             WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pollInterval:   ReturnType<typeof setInterval> | null = null;
    let ac:             AbortController | null = null;

    // Fire all 5 requests simultaneously — Binance price, CoinGecko, and 3 kline intervals.
    // Fetching price inline each cycle avoids the stale-closure problem that caused -100% changes.
    const loadAll = async () => {
      if (cancelled) return;
      ac?.abort();
      ac = new AbortController();
      const { signal } = ac;

      try {
        const [priceRes, cgRes, k5mRes, k1hRes, k6hRes] = await Promise.all([
          fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${binanceRest}`,
                { signal, cache: "no-store" }),
          fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${cgId}` +
                `&price_change_percentage=24h`,
                { signal, cache: "no-store" }),
          fetch(`https://api.binance.com/api/v3/klines?symbol=${binanceRest}&interval=5m&limit=2`,
                { signal, cache: "no-store" }),
          fetch(`https://api.binance.com/api/v3/klines?symbol=${binanceRest}&interval=1h&limit=2`,
                { signal, cache: "no-store" }),
          fetch(`https://api.binance.com/api/v3/klines?symbol=${binanceRest}&interval=6h&limit=2`,
                { signal, cache: "no-store" }),
        ]);
        if (cancelled) return;

        // Parse all bodies in parallel (each body stream consumed once)
        const [priceJson, cgJson, k5m, k1h, k6h] = await Promise.all([
          priceRes.ok  ? priceRes.json()  : Promise.resolve(null),
          cgRes.ok     ? cgRes.json()     : Promise.resolve([]),
          k5mRes.ok    ? k5mRes.json()    : Promise.resolve([]),
          k1hRes.ok    ? k1hRes.json()    : Promise.resolve([]),
          k6hRes.ok    ? k6hRes.json()    : Promise.resolve([]),
        ]);
        if (cancelled) return;

        // Current price from REST ticker
        const currentPrice: number = priceJson
          ? parseFloat((priceJson as { price: string }).price)
          : 0;
        if (isFinite(currentPrice) && currentPrice > 0) setLivePrice(currentPrice);

        // CoinGecko: volume, 24h change, circulating supply
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cgRow = (cgJson as any[])[0] ?? null;
        const volume24h:         number | null = cgRow?.total_volume                             ?? null;
        const change24h:         number | null = cgRow?.price_change_percentage_24h_in_currency ?? null;
        const circulatingSupply: number | null = cgRow?.circulating_supply                       ?? null;

        // Binance klines: change = (currentPrice - previousCandleClose) / previousCandleClose
        // klines[length-2] = last completed candle; field [4] = close price
        const klinesChange = (klines: unknown[][]): number | null => {
          if (!klines || klines.length < 2 || currentPrice === 0) return null;
          const prevClose = parseFloat(klines[klines.length - 2][4] as string);
          if (!isFinite(prevClose) || prevClose === 0) return null;
          return (currentPrice - prevClose) / prevClose * 100;
        };

        setCgData({
          volume24h,
          change5m:  klinesChange(k5m  as unknown[][]),
          change1h:  klinesChange(k1h  as unknown[][]),
          change6h:  klinesChange(k6h  as unknown[][]),
          change24h,
          circulatingSupply,
        });
        setLoading(false);
      } catch { /**/ }
    };

    // Initial load on mount (no waiting for WebSocket)
    loadAll();
    pollInterval = setInterval(loadAll, 30_000);

    // WebSocket for ~1s live price ticks after initial load
    const connect = () => {
      if (cancelled) return;
      ws = new WebSocket(`wss://stream.binance.com:9443/ws/${binanceSym}@ticker`);
      ws.onmessage = (event) => {
        if (cancelled) return;
        try {
          const price = parseFloat(JSON.parse(event.data as string).c);
          if (isFinite(price)) setLivePrice(price);
        } catch { /**/ }
      };
      ws.onerror = () => ws?.close();
      ws.onclose = () => {
        if (!cancelled) reconnectTimer = setTimeout(connect, 5_000);
      };
    };
    connect();

    return () => {
      cancelled = true;
      ws?.close();
      ac?.abort();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pollInterval)   clearInterval(pollInterval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cgId]);

  // ── Custom tokens: DexScreener polling (2s) ──────────────────────────────
  useEffect(() => {
    if (isCG || !tokenAddress) return;

    let cancelled = false;
    const ac      = new AbortController();

    const poll = async () => {
      if (cancelled) return;
      setUpdating(true);
      try {
        const res = await fetch(
          `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
          { cache: "no-store", signal: ac.signal }
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pairs: any[] = data.pairs ?? [];
        if (!pairs.length || cancelled) { setLoading(false); return; }
        pairs.sort((a, b) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0));
        const pair = pairs[0];
        if (cancelled) return;
        setDexData({
          priceUsd:  parseFloat(pair.priceUsd ?? "0"),
          marketCap: pair.marketCap ?? pair.fdv    ?? null,
          volume24h: pair.volume?.h24              ?? null,
          change5m:  pair.priceChange?.m5          ?? null,
          change1h:  pair.priceChange?.h1          ?? null,
          change6h:  pair.priceChange?.h6          ?? null,
          change24h: pair.priceChange?.h24         ?? null,
          symbol:    pair.baseToken?.symbol ?? tokenAddress.slice(0, 8),
        });
        setLoading(false);
      } catch { /**/ }
      finally { if (!cancelled) setUpdating(false); }
    };

    poll();
    const id = setInterval(poll, 2_000);
    return () => { cancelled = true; ac.abort(); clearInterval(id); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenAddress, isCG]);

  // ── Guard ─────────────────────────────────────────────────────────────────
  if (!targetToken && !tokenAddress && !tokenSymbol) return null;

  // Show skeleton while waiting for the first data
  if (loading && !livePrice && !cgData && !dexData) {
    return (
      <div className="flex items-center gap-4 px-3 py-2 rounded-lg border border-white/5 mb-2 animate-pulse"
           style={{ background: "#0d0f14" }}>
        {[72, 56, 56, 32, 32, 32, 32].map((w, i) => (
          <div key={i} className="h-6 bg-white/5 rounded" style={{ width: w }} />
        ))}
      </div>
    );
  }

  // ── Derive display values ─────────────────────────────────────────────────
  let price:    number | null = null;
  let mktCap:   number | null = null;
  let vol24h:   number | null = null;
  let c5m:      number | null = null;
  let c1h:      number | null = null;
  let c6h:      number | null = null;
  let c24h:     number | null = null;

  if (isCG) {
    price  = livePrice;
    mktCap = livePrice != null && cgData?.circulatingSupply != null
      ? livePrice * cgData.circulatingSupply
      : null;
    vol24h = cgData?.volume24h ?? null;
    c5m    = cgData?.change5m  ?? null;
    c1h    = cgData?.change1h  ?? null;
    c6h    = cgData?.change6h  ?? null;
    c24h   = cgData?.change24h ?? null;
  } else if (dexData) {
    price  = dexData.priceUsd;
    mktCap = dexData.marketCap;
    vol24h = dexData.volume24h;
    c5m    = dexData.change5m;
    c1h    = dexData.change1h;
    c6h    = dexData.change6h;
    c24h   = dexData.change24h;
  } else {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-2 rounded-lg border border-white/5 mb-2"
         style={{ background: "#0d0f14" }}>

      {/* Market cap */}
      <div className="flex flex-col">
        <div className="flex items-center gap-1 mb-0.5">
          <span className="text-[9px] text-white/25 uppercase tracking-wider">Mkt Cap</span>
          {updating && !loading && (
            <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse shrink-0" title="updating..." />
          )}
        </div>
        <span className="text-white font-mono font-bold text-xl leading-tight">{fmtLarge(mktCap)}</span>
      </div>

      <span className="hidden sm:block w-px h-8 bg-white/8 shrink-0" />

      {/* Live price */}
      <div className="flex flex-col">
        <span className="text-[9px] text-white/25 mb-0.5 uppercase tracking-wider">Price</span>
        <span className="text-white/80 text-sm font-mono font-semibold">{fmtPrice(price)}</span>
      </div>

      {/* Volume */}
      <div className="flex flex-col">
        <span className="text-[9px] text-white/25 mb-0.5 uppercase tracking-wider">Vol 24h</span>
        <span className="text-white/60 text-xs font-mono">{fmtLarge(vol24h)}</span>
      </div>

      <span className="hidden sm:block w-px h-8 bg-white/8 shrink-0" />

      <Change v={c5m}  label="5m"  />
      <Change v={c1h}  label="1h"  />
      <Change v={c6h}  label="6h"  />
      <Change v={c24h} label="24h" />
    </div>
  );
}
