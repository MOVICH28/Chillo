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
  isKline: boolean;
}

const BINANCE_MAP: Record<string, string> = {
  bitcoin: "btcusdt", solana: "solusdt",
  btc:     "btcusdt", sol:    "solusdt",
};

const LABEL_MAP: Record<string, string> = {
  bitcoin: "BTC/USDT", solana: "SOL/USDT",
  btc:     "BTC/USDT", sol:    "SOL/USDT",
};

const THROTTLE_MS: Partial<Record<Timeframe, number>> = {
  "1s": 1_000, "5s": 5_000, "30s": 30_000,
};

const KLINE_INTERVAL: Partial<Record<Timeframe, string>> = {
  "1m": "1m", "5m": "5m", "15m": "15m",
  "30m": "30m", "1h": "1h", "4h": "4h",
  "6h": "6h", "24h": "1d",
};

const MAX_STREAM_HISTORY = 150;
const KLINE_LIMIT        = 100;
const KLINE_REFRESH_MS   = 30_000;
const DEX_POLL_MS        = 5_000;

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
  } catch {
    return [];
  }
}

/**
 * Single useEffect drives exactly one data source per render cycle.
 * Re-runs only when sym / tokenAddress / timeframe changes — no race conditions.
 *
 * Mode A  BTC/SOL + kline timeframe (1m+)  → Binance klines REST, refresh every 30s
 * Mode B  BTC/SOL + stream timeframe        → Binance aggTrade WebSocket
 * Mode C  custom tokenAddress               → DexScreener polling every 5s
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
  const isKline       = !!klineInterval && !!binanceSymbol;
  const throttleMs    = THROTTLE_MS[timeframe] ?? 1_000;
  const defaultLabel  = binanceSymbol ? (LABEL_MAP[sym] ?? "TOKEN/USDT") : "TOKEN/USD";

  const [state, setState] = useState<TokenPriceState>({
    price: null, history: [], status: "connecting", label: defaultLabel, isKline,
  });

  useEffect(() => {
    const label = binanceSymbol ? (LABEL_MAP[sym] ?? "TOKEN/USDT") : "TOKEN/USD";

    // Reset immediately so stale data from previous source never shows
    setState({ price: null, history: [], status: "connecting", label, isKline });

    if (!binanceSymbol && !tokenAddress) return;

    let cancelled       = false;
    const ac            = new AbortController();
    let ws: WebSocket | null = null;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer:  ReturnType<typeof setTimeout>  | null = null;

    // Local mutable history — avoids stale closure over setState prev
    const history: OHLCPoint[] = [];
    let lastAdded = 0;

    // ── Mode A: Binance klines REST ────────────────────────────────────────────
    if (isKline && binanceSymbol && klineInterval) {
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

    // ── Mode B: Binance aggTrade WebSocket ─────────────────────────────────────
    else if (binanceSymbol) {
      const connect = () => {
        if (cancelled) return;
        ws = new WebSocket(`wss://stream.binance.com:9443/ws/${binanceSymbol}@aggTrade`);
        setState(s => ({ ...s, status: "connecting" }));

        ws.onopen = () => { if (!cancelled) setState(s => ({ ...s, status: "live" })); };

        ws.onmessage = (event) => {
          if (cancelled) return;
          const msg = JSON.parse(event.data as string);
          const p   = parseFloat(msg.p);
          if (!isFinite(p)) return;

          const now = Date.now();
          if (now - lastAdded >= throttleMs) {
            lastAdded = now;
            if (history.length >= MAX_STREAM_HISTORY) history.shift();
            history.push({ time: now, price: p });
          }
          setState({ price: p, history: [...history], status: "live", label, isKline: false });
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
    }

    // ── Mode C: DexScreener polling ────────────────────────────────────────────
    else if (tokenAddress) {
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
  // sym / tokenAddress / timeframe fully determine which source to use
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sym, tokenAddress, timeframe]);

  return state;
}
