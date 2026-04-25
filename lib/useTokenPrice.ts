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

const MAX_STREAM_HISTORY = 200;
const KLINE_LIMIT        = 100;
const KLINE_REFRESH_MS   = 30_000;
const DEX_POLL_MS        = 5_000;

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
 *           Returns isKline:true so CandleChart can show candles for all timeframes
 * Mode C  custom tokenAddress                → DexScreener polling every 5s
 */
export function useTokenPrice(opts: {
  targetToken?:  string | null;
  tokenSymbol?:  string | null;
  tokenAddress?: string | null;
  timeframe?:    Timeframe;
}): TokenPriceState {
  const { targetToken, tokenSymbol, tokenAddress, timeframe = "1s" } = opts;

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

    let cancelled      = false;
    const ac           = new AbortController();
    let ws: WebSocket | null = null;
    let pollInterval:   ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>  | null = null;

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
      const prefetch     = STREAM_PREFETCH[timeframe] ?? null;
      const periodMs     = CANDLE_PERIOD_MS[timeframe] ?? 1_000;

      // Mutable candle state — mutated in-place to avoid closure staleness
      let completedCandles: OHLCPoint[] = [];
      let currentCandle:   OHLCPoint | null = null;

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

            const now        = Date.now();
            const periodStart = Math.floor(now / periodMs) * periodMs;

            if (!currentCandle) {
              // First tick
              currentCandle = { time: periodStart, price: p, open: p, high: p, low: p, volume: vol };
            } else if (periodStart > currentCandle.time) {
              // Candle period closed — archive it and open a new one
              completedCandles.push({ ...currentCandle });
              if (completedCandles.length >= MAX_STREAM_HISTORY) completedCandles.shift();
              currentCandle = { time: periodStart, price: p, open: p, high: p, low: p, volume: vol };
            } else {
              // Same period — update OHLCV
              currentCandle.high   = Math.max(currentCandle.high!, p);
              currentCandle.low    = Math.min(currentCandle.low!, p);
              currentCandle.price  = p;
              currentCandle.volume = (currentCandle.volume ?? 0) + vol;
            }

            const combined = [...completedCandles, { ...currentCandle }];
            setState({ price: p, history: combined, status: "live", label, isKline: true });
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
            // Exclude any kline whose period overlaps the current streaming period
            const nowMs = Date.now();
            const currentPeriodStart = Math.floor(nowMs / periodMs) * periodMs;
            completedCandles = klines.filter(k => k.time < currentPeriodStart);
            // Show historical data immediately — user sees chart before WS connects
            setState(s => ({ ...s, history: [...completedCandles], isKline: true }));
          }
          openWS();
        })();
      } else {
        openWS();
      }
    }

    // ── Mode C: DexScreener polling ────────────────────────────────────────────
    else if (tokenAddress) {
      const history: OHLCPoint[] = [];

      const poll = async () => {
        if (cancelled) return;
        try {
          const res = await fetch(
            `/api/markets/token-lookup?address=${encodeURIComponent(tokenAddress)}`,
            { cache: "no-store", signal: ac.signal }
          );
          if (cancelled) return;
          if (!res.ok) { setState(s => ({ ...s, status: "error" })); return; }
          const d = await res.json();
          const p = parseFloat(d.priceUsd);
          if (!isFinite(p) || cancelled) return;
          if (history.length >= MAX_STREAM_HISTORY) history.shift();
          history.push({ time: Date.now(), price: p });
          setState({ price: p, history: [...history], status: "live", label: `${d.symbol ?? "TOKEN"}/USD`, isKline: false });
        } catch (e) {
          if (!cancelled && !(e instanceof DOMException && e.name === "AbortError")) {
            setState(s => ({ ...s, status: "error" }));
          }
        }
      };
      poll();
      pollInterval = setInterval(poll, DEX_POLL_MS);
    }

    return () => {
      cancelled = true;
      ac.abort();
      ws?.close();
      if (pollInterval)   clearInterval(pollInterval);
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sym, tokenAddress, timeframe]);

  return state;
}
