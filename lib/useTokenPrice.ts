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
const DEX_POLL_MS         = 2_000;

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

// ── LocalStorage persistence for custom token price history ──────────────────
const LS_KEY         = (a: string) => `pumpdora_price_history_${a}`;
const MAX_TICKS      = 500;
const HISTORY_TTL_MS = 86_400_000; // 24 hours

interface StoredTick { t: number; p: number; m: number; } // time, price, mcap

function lsLoad(addr: string): StoredTick[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = localStorage.getItem(LS_KEY(addr));
    return raw ? (JSON.parse(raw) as StoredTick[]) : [];
  } catch { return []; }
}

function lsSave(addr: string, ticks: StoredTick[]) {
  try {
    if (typeof window !== "undefined") localStorage.setItem(LS_KEY(addr), JSON.stringify(ticks));
  } catch { /**/ }
}

// Period in ms for each timeframe — used for candle aggregation in Mode C
const TIMEFRAME_PERIOD_MS: Record<Timeframe, number> = {
  "1s":   1_000,        "5s":   5_000,       "30s":  30_000,
  "1m":   60_000,       "5m":   300_000,     "15m":  900_000,
  "30m":  1_800_000,    "1h":   3_600_000,   "4h":   14_400_000,
  "6h":   21_600_000,   "24h":  86_400_000,
};

function aggregateCandles(ticks: StoredTick[], periodMs: number, useMcap: boolean): OHLCPoint[] {
  if (!ticks.length) return [];
  const buckets = new Map<number, { o: number; h: number; l: number; c: number }>();
  for (const tick of ticks) {
    const v = useMcap ? tick.m : tick.p;
    if (!v) continue;
    const key = Math.floor(tick.t / periodMs) * periodMs;
    const b   = buckets.get(key);
    if (!b) buckets.set(key, { o: v, h: v, l: v, c: v });
    else { b.h = Math.max(b.h, v); b.l = Math.min(b.l, v); b.c = v; }
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([time, c]) => ({ time, price: c.c, open: c.o, high: c.h, low: c.l, volume: 0 }));
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
 * Mode C  custom tokenAddress  → DexScreener polling every 2s
 *           Ticks persisted in localStorage (500 max, 24h TTL)
 *           History loaded on mount so returning users see chart immediately
 *           Ticks aggregated into OHLCV candles by timeframe period
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

    // ── Mode C: DexScreener polling (2s) + localStorage history ──────────────
    else if (tokenAddress) {
      // Streaming timeframes (1s/5s/30s) → raw ticks for Live canvas, isKline: false
      // Kline timeframes (1m+) → OHLCV candles for Line/Candles chart, isKline: true
      const isStreamingTF = !KLINE_INTERVAL[timeframe];
      const periodMs      = TIMEFRAME_PERIOD_MS[timeframe] ?? 60_000;

      // Load and prune persisted ticks (up to 24h old)
      const cutoff = Date.now() - HISTORY_TTL_MS;
      let ticks: StoredTick[] = lsLoad(tokenAddress).filter(t => t.t >= cutoff);
      let symbol = "TOKEN";

      // Bootstrap chart immediately from stored history
      if (ticks.length) {
        const lastTick = ticks[ticks.length - 1];
        if (isStreamingTF) {
          const raw = ticks.slice(-MAX_STREAM_HISTORY)
            .map(t => ({ time: t.t, price: showMcap ? t.m : t.p }))
            .filter(p => p.price > 0);
          if (raw.length) setState({ price: lastTick.p, history: raw, status: "connecting", label: "TOKEN/USD", isKline: false });
        } else {
          const candles = aggregateCandles(ticks, periodMs, showMcap);
          if (candles.length) setState({ price: lastTick.p, history: candles, status: "connecting", label: showMcap ? "TOKEN MCap" : "TOKEN/USD", isKline: true });
        }
      }

      const poll = async () => {
        if (cancelled) return;
        try {
          const res = await fetch(
            `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
            { cache: "no-store", signal: ac.signal }
          );
          if (cancelled || !res.ok) return;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data: any = await res.json();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pairs: any[] = data?.pairs ?? [];
          if (!pairs.length || cancelled) return;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pair: any = pairs.sort((a: any, b: any) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0))[0];
          const price = parseFloat(pair.priceUsd ?? "0");
          const mcap  = pair.marketCap ?? pair.fdv ?? 0;
          if (!isFinite(price) || price <= 0) return;
          symbol = pair.baseToken?.symbol ?? "TOKEN";

          // Append tick, prune to 24h + max 500
          ticks.push({ t: Date.now(), p: price, m: mcap });
          const cutoffNow = Date.now() - HISTORY_TTL_MS;
          ticks = ticks.filter(t => t.t >= cutoffNow);
          if (ticks.length > MAX_TICKS) ticks = ticks.slice(-MAX_TICKS);
          lsSave(tokenAddress, ticks);

          const lbl = showMcap ? `${symbol} MCap` : `${symbol}/USD`;

          if (isStreamingTF) {
            // Raw ticks for Live canvas — keep last 200
            const raw = ticks.slice(-MAX_STREAM_HISTORY)
              .map(t => ({ time: t.t, price: showMcap ? t.m : t.p }))
              .filter(p => p.price > 0);
            setState({
              price,
              history: raw.length ? raw : [{ time: Date.now(), price: showMcap ? mcap : price }],
              status:  "live",
              label:   lbl,
              isKline: false,
            });
          } else {
            // OHLCV candles for Line/Candles chart
            const candles = aggregateCandles(ticks, periodMs, showMcap);
            const fallback = showMcap ? mcap : price;
            setState({
              price,
              history: candles.length ? candles : [{ time: Date.now(), price: fallback, open: fallback, high: fallback, low: fallback, volume: 0 }],
              status:  "live",
              label:   lbl,
              isKline: true,
            });
          }
        } catch { /**/ }
      };

      poll();
      pollInterval = setInterval(poll, DEX_POLL_MS);
    }

    return () => {
      cancelled = true;
      ac.abort();
      ws?.close();
      if (pollInterval)      clearInterval(pollInterval);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (reconnectTimer)    clearTimeout(reconnectTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sym, tokenAddress, timeframe, showMcap]);

  return state;
}
