"use client";

import { useEffect, useState } from "react";
import { LiveData } from "@/lib/useLiveData";

interface RecentTrade {
  id: string;
  username: string | null;
  outcome: string;
  type: string;
  amount: number;
  profitLoss: number | null;
}

interface LiveTickerProps {
  liveData: LiveData;
}

export default function LiveTicker({ liveData }: LiveTickerProps) {
  const { btc, sol, pumpfun } = liveData;
  const [trades, setTrades] = useState<RecentTrade[]>([]);

  useEffect(() => {
    async function fetchTrades() {
      try {
        const res = await fetch("/api/trades/recent", { cache: "no-store" });
        if (res.ok) setTrades(await res.json());
      } catch { /* ignore */ }
    }
    fetchTrades();
    const id = setInterval(fetchTrades, 5_000);
    window.addEventListener("trade-placed", fetchTrades);
    return () => {
      clearInterval(id);
      window.removeEventListener("trade-placed", fetchTrades);
    };
  }, []);

  // Build one combined item list then duplicate for seamless scroll
  type TickerItem =
    | { kind: "price"; label: string; value: string; change: number | null }
    | { kind: "trade"; trade: RecentTrade };

  const items: TickerItem[] = [
    btc
      ? { kind: "price", label: "BTC", value: `$${btc.price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`, change: btc.change24h }
      : { kind: "price", label: "BTC", value: "—", change: null },
    sol
      ? { kind: "price", label: "SOL", value: `$${sol.price.toFixed(2)}`, change: sol.change24h }
      : { kind: "price", label: "SOL", value: "—", change: null },
    { kind: "price", label: "pump.fun 24h Vol", value: pumpfun ? `$${pumpfun.volume24h}M` : "—", change: null },
    { kind: "price", label: "Tokens Today",     value: pumpfun ? pumpfun.newTokensToday.toLocaleString() : "—", change: null },
    ...trades.map(t => ({ kind: "trade" as const, trade: t })),
  ];

  const scrollItems = [...items, ...items];

  return (
    <div className="h-9 bg-surface border-b border-surface-3 overflow-hidden flex items-center">
      <div className="flex-shrink-0 px-3 text-xs font-semibold text-brand border-r border-surface-3 h-full flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
        LIVE
      </div>
      <div className="overflow-hidden flex-1">
        <div className="flex gap-8 animate-ticker whitespace-nowrap">
          {scrollItems.map((item, i) => {
            if (item.kind === "price") {
              return (
                <div key={i} className="flex items-center gap-1.5 text-xs">
                  <span className="text-muted">{item.label}</span>
                  <span className="text-white font-mono font-medium">{item.value}</span>
                  {item.change !== null && (
                    <span className={item.change >= 0 ? "text-yes" : "text-no"}>
                      {item.change >= 0 ? "▲" : "▼"}{Math.abs(item.change).toFixed(2)}%
                    </span>
                  )}
                </div>
              );
            }
            const t = item.trade;
            const isBuy = t.type === "buy";
            return (
              <div key={i} className="flex items-center gap-1.5 text-xs">
                <span className="text-white/40 font-mono">{t.username ?? "anon"}</span>
                <span className={`px-1 py-px rounded text-[10px] font-bold ${isBuy ? "bg-[#22c55e]/15 text-[#22c55e]" : "bg-red-500/15 text-red-400"}`}>
                  {isBuy ? "BUY" : "SELL"}
                </span>
                <span className="text-white/60 font-mono">{t.outcome}</span>
                <span className="text-white font-mono">{t.amount.toFixed(1)} D</span>
                {!isBuy && t.profitLoss !== null && (
                  <span className={`font-mono text-[10px] ${t.profitLoss >= 0 ? "text-[#22c55e]" : "text-red-400"}`}>
                    {t.profitLoss >= 0 ? "+" : ""}{t.profitLoss.toFixed(1)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
