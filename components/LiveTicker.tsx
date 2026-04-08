"use client";

import { LiveData } from "@/lib/useLiveData";

interface LiveTickerProps {
  liveData: LiveData;
}

export default function LiveTicker({ liveData }: LiveTickerProps) {
  const { btc, sol, pumpfun } = liveData;

  const items = [
    btc
      ? {
          label: "BTC",
          value: `$${btc.price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
          change: btc.change24h,
        }
      : { label: "BTC", value: "—", change: null },
    sol
      ? {
          label: "SOL",
          value: `$${sol.price.toFixed(2)}`,
          change: sol.change24h,
        }
      : { label: "SOL", value: "—", change: null },
    {
      label: "pump.fun 24h Vol",
      value: pumpfun ? `$${pumpfun.volume24h}M` : "—",
      change: null,
    },
    {
      label: "Tokens Today",
      value: pumpfun ? pumpfun.newTokensToday.toLocaleString() : "—",
      change: null,
    },
    {
      label: "All-Time Tokens",
      value: pumpfun ? pumpfun.totalTokens.toLocaleString() : "—",
      change: null,
    },
  ];

  // Duplicate for seamless loop
  const scrollItems = [...items, ...items];

  return (
    <div className="h-9 bg-surface border-b border-surface-3 overflow-hidden flex items-center">
      <div className="flex-shrink-0 px-3 text-xs font-semibold text-brand border-r border-surface-3 h-full flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
        LIVE
      </div>
      <div className="overflow-hidden flex-1">
        <div className="flex gap-8 animate-ticker whitespace-nowrap">
          {scrollItems.map((item, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <span className="text-muted">{item.label}</span>
              <span className="text-white font-mono font-medium">{item.value}</span>
              {item.change !== null && (
                <span className={item.change >= 0 ? "text-yes" : "text-no"}>
                  {item.change >= 0 ? "▲" : "▼"}{Math.abs(item.change).toFixed(2)}%
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
