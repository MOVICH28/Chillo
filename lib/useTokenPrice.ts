"use client";

import { useState, useEffect, useRef } from "react";

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
  isKline: boolean; // true when data comes from kline REST (has OHLCV)
}

const BINANCE_MAP: Record<string, string> = {
  bitcoin: "btcusdt", solana: "solusdt",
  btc:     "btcusdt", sol:    "solusdt",
};

const LABEL_MAP: Record<string, string> = {
  bitcoin: "BTC/USDT", solana: "SOL/USDT",
  btc:     "BTC/USDT", sol:    "SOL/USDT",
};

// ms to throttle streaming history points at this timeframe
const THROTTLE_MS: Partial<Record<Timeframe, number>> = {
  "1s": 1_000, "5s": 5_000, "30s": 30_000,
};

// Binance kline interval string for each timeframe
const KLINE_INTERVAL: Partial<Record<Timeframe, string>> = {
  "1m": "1m", "5m": "5m", "15m": "15m",
  "30m": "30m", "1h": "1h", "4h": "4h",
  "6h": "6h", "24h": "1d",
};

const MAX_STREAM_HISTORY = 150;
const KLINE_LIMIT        = 100;
const KLINE_REFRESH_MS   = 30_000;
const DEX_POLL_MS        = 5_000;

async function fetchKlines(symbol: string, interval: string): Promise<OHLCPoint[]> {
  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${KLINE_LIMIT}`
    );
    if (!res.ok) return [];
    const raw: unknown[][] = await res.json() as unknown[][];
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

/**
 * Unified price hook supporting all timeframes.
 *
 * BTC/SOL + streaming (1s/5s/30s) → Binance aggTrade WebSocket
 * BTC/SOL + kline (1m+)           → Binance klines REST, refreshed every 30s
 * Custom tokenAddress              → DexScreener polling every 5s (all timeframes)
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
  const throttleMs    = THROTTLE_MS[timeframe] ?? 1_000;
  const klineInterval = KLINE_INTERVAL[timeframe] ?? null;
  const isKline       = !!klineInterval && !!binanceSymbol;

  const defaultLabel = binanceSymbol ? (LABEL_MAP[sym] ?? "TOKEN/USDT") : "TOKEN/USD";

  const [state, setState] = useState<TokenPriceState>({
    price: null, history: [], status: "connecting", label: defaultLabel, isKline: false,
  });

  const historyRef    = useRef<OHLCPoint[]>([]);
  const lastAddedRef  = useRef<number>(0);
  const throttleRef   = useRef<number>(throttleMs);
  // Update throttle without restarting WebSocket
  useEffect(() => { throttleRef.current = throttleMs; }, [throttleMs]);

  // ── Binance WebSocket — streaming timeframes (1s / 5s / 30s) ─────────────
  useEffect(() => {
    if (!binanceSymbol || isKline) return;

    const label = LABEL_MAP[sym] ?? "TOKEN/USDT";
    historyRef.current   = [];
    lastAddedRef.current = 0;
    setState({ price: null, history: [], status: "connecting", label, isKline: false });

    let ws: WebSocket;
    let reconnectId: ReturnType<typeof setTimeout>;

    function connect() {
      ws = new WebSocket(`wss://stream.binance.com:9443/ws/${binanceSymbol}@aggTrade`);
      setState(s => ({ ...s, status: "connecting" }));

      ws.onopen = () => setState(s => ({ ...s, status: "live" }));

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data as string);
        const p = parseFloat(data.p);
        if (!isFinite(p)) return;

        const now = Date.now();
        if (now - lastAddedRef.current >= throttleRef.current) {
          lastAddedRef.current = now;
          const point: OHLCPoint = { time: now, price: p };
          historyRef.current = historyRef.current.length >= MAX_STREAM_HISTORY
            ? [...historyRef.current.slice(1), point]
            : [...historyRef.current, point];
        }
        setState({ price: p, history: historyRef.current, status: "live", label, isKline: false });
      };

      ws.onerror = () => setState(s => ({ ...s, status: "error" }));
      ws.onclose = () => {
        setState(s => ({ ...s, status: "error" }));
        reconnectId = setTimeout(connect, 5_000);
      };
    }

    connect();
    return () => { clearTimeout(reconnectId); ws?.close(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binanceSymbol, isKline]);

  // ── Binance klines REST — longer timeframes (1m+) ─────────────────────────
  useEffect(() => {
    if (!binanceSymbol || !klineInterval) return;

    const label = LABEL_MAP[sym] ?? "TOKEN/USDT";
    historyRef.current = [];
    setState({ price: null, history: [], status: "connecting", label, isKline: true });

    let cancelled = false;

    async function load() {
      const points = await fetchKlines(binanceSymbol!, klineInterval!);
      if (cancelled) return;
      if (!points.length) { setState(s => ({ ...s, status: "error" })); return; }
      historyRef.current = points;
      setState({ price: points[points.length - 1].price, history: points, status: "live", label, isKline: true });
    }

    load();
    const id = setInterval(load, KLINE_REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binanceSymbol, klineInterval]);

  // ── DexScreener polling — custom tokens (all timeframes) ──────────────────
  useEffect(() => {
    if (binanceSymbol || !tokenAddress) return;

    let cancelled  = false;
    historyRef.current = [];
    setState({ price: null, history: [], status: "connecting", label: "TOKEN/USD", isKline: false });

    async function poll() {
      try {
        const res = await fetch(
          `/api/markets/token-lookup?address=${encodeURIComponent(tokenAddress!)}`,
          { cache: "no-store" }
        );
        if (cancelled) return;
        if (!res.ok) { setState(s => ({ ...s, status: "error" })); return; }
        const data = await res.json();
        const p    = parseFloat(data.priceUsd);
        if (!isFinite(p) || cancelled) return;
        const point: OHLCPoint = { time: Date.now(), price: p };
        historyRef.current = [...historyRef.current.slice(-149), point];
        const label = `${data.symbol ?? "TOKEN"}/USD`;
        setState({ price: p, history: historyRef.current, status: "live", label, isKline: false });
      } catch {
        if (!cancelled) setState(s => ({ ...s, status: "error" }));
      }
    }

    poll();
    const id = setInterval(poll, DEX_POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binanceSymbol, tokenAddress]);

  return state;
}
