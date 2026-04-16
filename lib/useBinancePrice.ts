"use client";

import { useState, useEffect, useRef } from "react";
import { PricePoint } from "./usePriceHistory";

const MAX_HISTORY   = 150; // ~5 min at 2s throttle
const THROTTLE_MS   = 2_000;

export interface BinancePriceState {
  price:   number | null;
  history: PricePoint[];
  status:  "connecting" | "live" | "error";
}

const SYMBOL_MAP: Record<string, string> = {
  bitcoin: "btcusdt",
  solana:  "solusdt",
};

/** Real-time price via Binance aggTrade WebSocket, throttled to one history point per 2 s. */
export function useBinancePrice(token: "bitcoin" | "solana"): BinancePriceState {
  const [state, setState] = useState<BinancePriceState>({
    price: null, history: [], status: "connecting",
  });
  const lastAddedRef = useRef<number>(0);
  const priceRef     = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const symbol = SYMBOL_MAP[token];
    let ws: WebSocket;
    let reconnectId: ReturnType<typeof setTimeout>;

    function connect() {
      ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol}@aggTrade`);
      setState(s => ({ ...s, status: "connecting" }));

      ws.onopen = () => setState(s => ({ ...s, status: "live" }));

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data as string);
        const p = parseFloat(data.p);
        if (!isFinite(p)) return;

        priceRef.current = p;
        const now = Date.now();

        setState(prev => {
          const point = now - lastAddedRef.current >= THROTTLE_MS
            ? (() => { lastAddedRef.current = now; return { time: now, price: p }; })()
            : null;

          const history = point
            ? (prev.history.length >= MAX_HISTORY
                ? [...prev.history.slice(1), point]
                : [...prev.history, point])
            : prev.history;

          return { price: p, history, status: "live" };
        });
      };

      ws.onerror = () => setState(s => ({ ...s, status: "error" }));

      ws.onclose = () => {
        setState(s => ({ ...s, status: "error" }));
        // Reconnect after 5 s
        reconnectId = setTimeout(connect, 5_000);
      };
    }

    connect();
    return () => {
      clearTimeout(reconnectId);
      ws?.close();
    };
  }, [token]);

  return state;
}
