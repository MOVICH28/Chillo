"use client";

import { useState, useEffect } from "react";

export type Timeframe = "1s" | "5s" | "30s" | "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "6h" | "24h";

export interface OHLCPoint {
  time:    number;
  price:   number; // close
  open?:   number;
  high?:   number;
  low?:    number;
  volume?: number;
}

export interface TokenPriceState {
  price:   number | null;
  history: OHLCPoint[];
  status:  "connecting" | "live" | "error";
  label:   string;
  isKline: boolean; // true = history has OHLCV (klines REST or streaming candles)
}

const BINANCE_MAP: Record<string, string> = {
  bitcoin: "btcusdt", solana: "solusdt",
  btc:     "btcusdt", sol:    "solusdt",
};

const LABEL_MAP: Record<string, string> = {
  bitcoin: "BTC/USDT", solana: "SOL/USDT",
  btc:     "BTC/USDT", sol:    "SOL/USDT",
};

// Kline interval for each REST-based timeframe (Mode A)
const KLINE_INTERVAL: Partial<Record<Timeframe, string>> = {
  "1m": "1m", "5m": "5m", "15m": "15m",
  "30m": "30m", "1h": "1h", "4h": "4h",
  "6h": "6h", "24h": "1d",
};

// For streaming timeframes: which kline interval to pre-load as backdrop history
const STREAM_PREFETCH: Partial<Record<Timeframe, { interval: string; limit: number }>> = {
  "1s":  { interval: "1m",  limit: 200 },
  "5s":  { interval: "5m",  limit: 200 },
  "30s": { interval: "15m", limit: 200 },
};

// Candle aggregation period for streaming ticks (ms)
const CANDLE_PERIOD_MS: Partial<Record<Timeframe, number>> = {
  "1s": 1_000, "5s": 5_000, "30s": 30_000,
};

const MAX_STREAM_HISTORY  = 200;
const KLINE_LIMIT         = 100;
const KLINE_REFRESH_MS    = 30_000;
const JUPITER_POLL_MS     = 2_000;
const DEX_META_POLL_MS    = 15_000;

// Mode A: klines REST — uses close time as timestamp (c[6])
async function fetchKlines(symbol: string, interval: string, signal: AbortSignal): Promise<OHLCPoint[]> {
  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${KLINE_LIMIT}`,
      { signal }
    );
    if (!res.ok) return [];
    const raw = await res.json() as unknown[][];
    return raw.map(c => ({
      time:   c[6] as number,
      price:  parseFloat(c[4] as string),
      open:   parseFloat(c[1] as string),
      high:   parseFloat(c[2] as string),
      low:    parseFloat(c[3] as string),
      volume: parseFloat(c[5] as string),
    }));
  } catch { return []; }
}

// Mode B prefetch: uses open time as timestamp (c[0]) — consistent with streaming candle period starts
async function fetchKlinesStream(
  symbol: string, interval: string, limit: number, signal: AbortSignal
): Promise<OHLCPoint[]> {
  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`,
      { signal }
    );
    if (!res.ok) return [];
    const raw = await res.json() as unknown[][];
    return raw.map(c => ({
      time:   c[0] as number,  // open time — aligns with streaming candle period starts
      price:  parseFloat(c[4] as string),
      open:   parseFloat(c[1] as string),
      high:   parseFloat(c[2] as string),
      low:    parseFloat(c[3] as string),
      volume: parseFloat(c[5] as string),
    }));
  } catch { return []; }
}

/**
 * Single useEffect, exactly one active data source at a time.
 *
 * Mode A  BTC/SOL + kline timeframe (1m+)   → Binance klines REST, refresh every 30s
 * Mode B  BTC/SOL + stream timeframe (1s/5s/30s)
 *           1. Pre-fetch klines for historical backdrop
 *           2. Open aggTrade WebSocket
 *           3. Aggregate ticks into OHLCV candles per candle period
 *           Emission: 1s = every raw tick; 5s/30s = only on period close
 * Mode C  custom tokenAddress
 *           Primary:  Jupiter Price API every 2s  → fast price for chart history
 *           Fallback: DexScreener every 15s       → metadata (mcap, volume, changes)
 *                     Also bootstraps if Jupiter has no data for this token
 */
export function useTokenPrice(opts: {
  targetToken?:  string | null;
  tokenSymbol?:  string | null;
  tokenAddress?: string | null;
  timeframe?:    Timeframe;
  showMcap?:     boolean;
}): TokenPriceState {
  const { targetToken, tokenSymbol, tokenAddress, timeframe = "1s", showMcap = false } = opts;

  const sym           = (targetToken ?? tokenSymbol ?? "").toLowerCase();
  const binanceSymbol = BINANCE_MAP[sym] ?? null;
  const klineInterval = KLINE_INTERVAL[timeframe] ?? null;
  const isKlineMode   = !!klineInterval && !!binanceSymbol;
  const defaultLabel  = binanceSymbol ? (LABEL_MAP[sym] ?? "TOKEN/USDT") : "TOKEN/USD";

  const [state, setState] = useState<TokenPriceState>({
    price: null, history: [], status: "connecting", label: defaultLabel, isKline: isKlineMode,
  });

  useEffect(() => {
    const label = binanceSymbol ? (LABEL_MAP[sym] ?? "TOKEN/USDT") : "TOKEN/USD";

    setState({ price: null, history: [], status: "connecting", label, isKline: isKlineMode });

    if (!binanceSymbol && !tokenAddress) return;

    let cancelled        = false;
    const ac             = new AbortController();
    let ws: WebSocket | null = null;
    let pollInterval:     ReturnType<typeof setInterval> | null = null;
    let dexInterval:      ReturnType<typeof setInterval> | null = null;
    let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer:   ReturnType<typeof setTimeout>  | null = null;

    // ── Mode A: Binance klines REST (1m+) ─────────────────────────────────────
    if (isKlineMode && binanceSymbol && klineInterval) {
      const load = async () => {
        if (cancelled) return;
        const points = await fetchKlines(binanceSymbol, klineInterval, ac.signal);
        if (cancelled) return;
        if (!points.length) { setState(s => ({ ...s, status: "error" })); return; }
        setState({ price: points[points.length - 1].price, history: points, status: "live", label, isKline: true });
      };
      load();
      pollInterval = setInterval(load, KLINE_REFRESH_MS);
    }

    // ── Mode B: Binance WebSocket + candle aggregation ─────────────────────────
    else if (binanceSymbol) {
      const prefetch = STREAM_PREFETCH[timeframe] ?? null;
      const periodMs = CANDLE_PERIOD_MS[timeframe] ?? 1_000;

      // Mutable candle state — mutated in-place to avoid closure staleness
      let completedCandles: OHLCPoint[] = [];
      let currentCandle:   OHLCPoint | null = null;
      let lastKnownPrice   = 0;

      const openWS = () => {
        const connect = () => {
          if (cancelled) return;
          ws = new WebSocket(`wss://stream.binance.com:9443/ws/${binanceSymbol}@aggTrade`);
          setState(s => ({ ...s, status: "connecting" }));

          ws.onopen = () => { if (!cancelled) setState(s => ({ ...s, status: "live" })); };

          ws.onmessage = (event) => {
            if (cancelled) return;
            const msg = JSON.parse(event.data as string);
            const p   = parseFloat(msg.p);
            const vol = parseFloat(msg.q ?? "0");
            if (!isFinite(p)) return;
            lastKnownPrice = p;

            const now         = Date.now();
            const periodStart = Math.floor(now / periodMs) * periodMs;
            let   periodChanged = false;

            if (!currentCandle) {
              currentCandle = { time: periodStart, price: p, open: p, high: p, low: p, volume: vol };
              periodChanged = true; // first tick always emits
            } else if (periodStart > currentCandle.time) {
              // Candle period closed — archive and open new
              completedCandles.push({ ...currentCandle });
              if (completedCandles.length >= MAX_STREAM_HISTORY) completedCandles.shift();
              currentCandle = { time: periodStart, price: p, open: p, high: p, low: p, volume: vol };
              periodChanged = true;
            } else {
              // Same period — update OHLCV in place
              currentCandle.high   = Math.max(currentCandle.high!, p);
              currentCandle.low    = Math.min(currentCandle.low!, p);
              currentCandle.price  = p;
              currentCandle.volume = (currentCandle.volume ?? 0) + vol;
            }

            // 1s: emit every tick for smooth snake animation
            // 5s/30s: emit only on period close (one point per interval)
            if (periodMs === 1_000 || periodChanged) {
              const combined = [...completedCandles, { ...currentCandle }];
              setState({ price: p, history: combined, status: "live", label, isKline: true });
            }
          };

          ws.onerror = () => { if (!cancelled) setState(s => ({ ...s, status: "error" })); };
          ws.onclose = () => {
            if (!cancelled) {
              setState(s => ({ ...s, status: "error" }));
              reconnectTimer = setTimeout(connect, 5_000);
            }
          };
        };
        connect();
      };

      if (prefetch) {
        // Fetch historical backdrop first, then open WebSocket
        (async () => {
          const klines = await fetchKlinesStream(binanceSymbol, prefetch.interval, prefetch.limit, ac.signal);
          if (cancelled) return;
          if (klines.length) {
            const nowMs = Date.now();
            const currentPeriodStart = Math.floor(nowMs / periodMs) * periodMs;
            completedCandles = klines.filter(k => k.time < currentPeriodStart);
            setState(s => ({ ...s, history: [...completedCandles], isKline: true }));
          }
          openWS();
        })();
      } else {
        openWS();
      }

      // Heartbeat for 1s mode: ensure a point is added every second even during quiet markets
      if (periodMs === 1_000) {
        heartbeatInterval = setInterval(() => {
          if (cancelled || lastKnownPrice <= 0) return;
          const p   = lastKnownPrice;
          const now = Date.now();
          const periodStart = Math.floor(now / periodMs) * periodMs;
          if (!currentCandle) {
            currentCandle = { time: periodStart, price: p, open: p, high: p, low: p, volume: 0 };
          } else if (periodStart > currentCandle.time) {
            completedCandles.push({ ...currentCandle });
            if (completedCandles.length >= MAX_STREAM_HISTORY) completedCandles.shift();
            currentCandle = { time: periodStart, price: p, open: p, high: p, low: p, volume: 0 };
          }
          const combined = [...completedCandles, { ...currentCandle }];
          setState({ price: p, history: combined, status: "live", label, isKline: true });
        }, 1_000);
      }
    }

    // ── Mode C: Jupiter (2s price) + DexScreener (15s metadata) ──────────────
    else if (tokenAddress) {
      const history: OHLCPoint[] = [];
      // Mutable metadata updated by DexScreener poll (no re-render on its own)
      let symbol   = "TOKEN";
      let dexPrice = 0;
      let dexMcap  = 0;
      let jupFailed = false; // true when Jupiter has no data for this token

      // DexScreener: symbol, mcap, volume, price changes (15s)
      const pollDex = async () => {
        if (cancelled) return;
        try {
          const res = await fetch(
            `/api/markets/token-lookup?address=${encodeURIComponent(tokenAddress)}`,
            { cache: "no-store", signal: ac.signal }
          );
          if (cancelled || !res.ok) return;
          const d = await res.json();
          if (cancelled) return;
          symbol   = d.symbol ?? "TOKEN";
          dexPrice = parseFloat(d.priceUsd) || 0;
          dexMcap  = d.mcapUsd ?? 0;
          // Bootstrap history from DexScreener if Jupiter has no data yet
          if (jupFailed || !history.length) {
            const p = showMcap ? dexMcap : dexPrice;
            if (p > 0) {
              if (history.length >= MAX_STREAM_HISTORY) history.shift();
              history.push({ time: Date.now(), price: p });
              const lbl = showMcap ? `${symbol} MCap` : `${symbol}/USD`;
              setState({ price: dexPrice, history: [...history], status: "live", label: lbl, isKline: false });
            }
          }
        } catch { /**/ }
      };

      // Jupiter Price API: fast price ticks (2s)
      const pollJupiter = async () => {
        if (cancelled) return;
        try {
          const res = await fetch(
            `https://price.jup.ag/v6/price?ids=${tokenAddress}`,
            { cache: "no-store", signal: ac.signal }
          );
          if (cancelled || !res.ok) { jupFailed = true; return; }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const d: any = await res.json();
          const entry = d?.data?.[tokenAddress];
          if (!entry || cancelled) { jupFailed = true; return; }
          const jupPrice = parseFloat(entry.price ?? "0");
          if (!isFinite(jupPrice) || jupPrice <= 0) { jupFailed = true; return; }
          jupFailed = false;

          // Chart value: near-real-time mcap (jupPrice × circulatingSupply) or price
          let chartValue: number;
          if (showMcap) {
            chartValue = dexMcap > 0 && dexPrice > 0
              ? jupPrice * (dexMcap / dexPrice)
              : dexMcap;
            if (chartValue <= 0) return;
          } else {
            chartValue = jupPrice;
          }

          if (history.length >= MAX_STREAM_HISTORY) history.shift();
          history.push({ time: Date.now(), price: chartValue });
          const lbl = showMcap ? `${symbol} MCap` : `${symbol}/USD`;
          setState({ price: jupPrice, history: [...history], status: "live", label: lbl, isKline: false });
        } catch { jupFailed = true; }
      };

      // Bootstrap: DexScreener first (symbol + initial price), then Jupiter
      pollDex().then(() => pollJupiter());
      pollInterval = setInterval(pollJupiter, JUPITER_POLL_MS);
      dexInterval  = setInterval(pollDex,     DEX_META_POLL_MS);
    }

    return () => {
      cancelled = true;
      ac.abort();
      ws?.close();
      if (pollInterval)      clearInterval(pollInterval);
      if (dexInterval)       clearInterval(dexInterval);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (reconnectTimer)    clearTimeout(reconnectTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sym, tokenAddress, timeframe, showMcap]);

  return state;
}
