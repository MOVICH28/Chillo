"use client";

import { useState, useEffect, useRef } from "react";
import { PricePoint } from "./usePriceHistory";

export interface TokenPriceState {
  price:   number | null;
  history: PricePoint[];
  status:  "connecting" | "live" | "error";
  label:   string;
}

const BINANCE_MAP: Record<string, string> = {
  bitcoin: "btcusdt",
  solana:  "solusdt",
  btc:     "btcusdt",
  sol:     "solusdt",
};

const LABEL_MAP: Record<string, string> = {
  bitcoin: "BTC/USDT",
  solana:  "SOL/USDT",
  btc:     "BTC/USDT",
  sol:     "SOL/USDT",
};

const MAX_HISTORY  = 150;
const THROTTLE_MS  = 1_000;
const DEX_POLL_MS  = 5_000;

/**
 * Unified price hook.
 * - targetToken / tokenSymbol == "bitcoin"/"BTC"/"solana"/"SOL" → Binance aggTrade WebSocket
 * - tokenAddress → DexScreener polling every 5s
 */
export function useTokenPrice(opts: {
  targetToken?:  string | null;
  tokenSymbol?:  string | null;
  tokenAddress?: string | null;
}): TokenPriceState {
  const { targetToken, tokenSymbol, tokenAddress } = opts;

  const sym = (targetToken ?? tokenSymbol ?? "").toLowerCase();
  const binanceSymbol = BINANCE_MAP[sym] ?? null;

  const [state, setState] = useState<TokenPriceState>({
    price: null, history: [], status: "connecting",
    label: binanceSymbol ? (LABEL_MAP[sym] ?? "TOKEN/USDT") : "TOKEN/USDT",
  });

  const lastAddedRef = useRef<number>(0);
  const historyRef   = useRef<PricePoint[]>([]);

  // Binance WebSocket path
  useEffect(() => {
    if (!binanceSymbol) return;

    let ws: WebSocket;
    let reconnectId: ReturnType<typeof setTimeout>;

    const label = LABEL_MAP[sym] ?? "TOKEN/USDT";

    setState({ price: null, history: [], status: "connecting", label });
    historyRef.current   = [];
    lastAddedRef.current = 0;

    function connect() {
      ws = new WebSocket(`wss://stream.binance.com:9443/ws/${binanceSymbol}@aggTrade`);
      setState(s => ({ ...s, status: "connecting" }));

      ws.onopen = () => setState(s => ({ ...s, status: "live" }));

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data as string);
        const p = parseFloat(data.p);
        if (!isFinite(p)) return;

        const now = Date.now();
        if (now - lastAddedRef.current >= THROTTLE_MS) {
          lastAddedRef.current = now;
          const point: PricePoint = { time: now, price: p };
          historyRef.current = historyRef.current.length >= MAX_HISTORY
            ? [...historyRef.current.slice(1), point]
            : [...historyRef.current, point];
        }

        setState({ price: p, history: historyRef.current, status: "live", label });
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
  }, [binanceSymbol]);

  // DexScreener polling path
  useEffect(() => {
    if (binanceSymbol || !tokenAddress) return;

    let cancelled = false;
    historyRef.current = [];
    setState({ price: null, history: [], status: "connecting", label: "TOKEN/USD" });

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

        const now   = Date.now();
        const point: PricePoint = { time: now, price: p };
        historyRef.current = [...historyRef.current.slice(-149), point];

        const label = `${data.symbol ?? "TOKEN"}/USD`;
        setState({ price: p, history: historyRef.current, status: "live", label });
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
