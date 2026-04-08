"use client";

import { useEffect, useState } from "react";

interface PriceData {
  btc: number;
  sol: number;
  btcChange: number;
  solChange: number;
  pumpVolume: string;
  pumpTokens: number;
  pumpNew: number;
}

const MOCK_BASE: PriceData = {
  btc: 68420,
  sol: 82.54,
  btcChange: 2.14,
  solChange: -1.32,
  pumpVolume: "$187.4M",
  pumpTokens: 42381,
  pumpNew: 1842,
};

export default function LiveTicker() {
  const [data, setData] = useState<PriceData>(MOCK_BASE);

  // Simulate tiny price fluctuations
  useEffect(() => {
    const interval = setInterval(() => {
      setData((prev) => ({
        ...prev,
        btc: parseFloat((prev.btc + (Math.random() - 0.5) * 120).toFixed(0)),
        sol: parseFloat((prev.sol + (Math.random() - 0.5) * 0.8).toFixed(2)),
        pumpNew: prev.pumpNew + Math.floor(Math.random() * 3),
      }));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const items = [
    { label: "BTC", value: `$${data.btc.toLocaleString()}`, change: data.btcChange },
    { label: "SOL", value: `$${data.sol.toFixed(2)}`, change: data.solChange },
    { label: "pump.fun 24h Vol", value: data.pumpVolume, change: null },
    { label: "Total Tokens", value: data.pumpTokens.toLocaleString(), change: null },
    { label: "New Today", value: data.pumpNew.toLocaleString(), change: null },
    { label: "BTC", value: `$${data.btc.toLocaleString()}`, change: data.btcChange },
    { label: "SOL", value: `$${data.sol.toFixed(2)}`, change: data.solChange },
    { label: "pump.fun 24h Vol", value: data.pumpVolume, change: null },
    { label: "Total Tokens", value: data.pumpTokens.toLocaleString(), change: null },
    { label: "New Today", value: data.pumpNew.toLocaleString(), change: null },
  ];

  return (
    <div className="h-9 bg-surface border-b border-surface-3 overflow-hidden flex items-center">
      <div className="flex-shrink-0 px-3 text-xs font-semibold text-brand border-r border-surface-3 h-full flex items-center">
        LIVE
      </div>
      <div className="overflow-hidden flex-1">
        <div className="flex gap-8 animate-ticker whitespace-nowrap">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <span className="text-muted">{item.label}</span>
              <span className="text-white font-mono font-medium">{item.value}</span>
              {item.change !== null && (
                <span className={item.change >= 0 ? "text-yes" : "text-no"}>
                  {item.change >= 0 ? "▲" : "▼"} {Math.abs(item.change)}%
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
