"use client";

import { useState, useEffect } from "react";

interface Stats {
  priceUsd:    number;
  marketCap:   number | null;
  volume24h:   number | null;
  priceChange: { m5: number | null; h1: number | null; h6: number | null; h24: number | null };
  symbol:      string;
}

function fmtLarge(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3)  return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtPrice(p: number): string {
  if (p >= 1000) return `$${Math.round(p).toLocaleString("en-US")}`;
  if (p >= 1)    return `$${p.toFixed(4)}`;
  if (p >= 0.01) return `$${p.toFixed(6)}`;
  return `$${p.toFixed(8)}`;
}

function Change({ v, label }: { v: number | null; label: string }) {
  return (
    <div className="flex flex-col items-center min-w-[36px]">
      <span className="text-[9px] text-white/30 mb-0.5 uppercase tracking-wider">{label}</span>
      {v == null ? (
        <span className="text-[11px] text-white/25">—</span>
      ) : (
        <span className={`text-[11px] font-semibold tabular-nums ${v >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
          {v >= 0 ? "+" : ""}{v.toFixed(2)}%
        </span>
      )}
    </div>
  );
}

interface Props {
  targetToken?:  string | null;
  tokenAddress?: string | null;
  tokenSymbol?:  string | null;
}

export default function TokenStats({ targetToken, tokenAddress, tokenSymbol }: Props) {
  const [stats, setStats]     = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const p = new URLSearchParams();
    if (targetToken)  p.set("targetToken",  targetToken);
    if (tokenAddress) p.set("tokenAddress", tokenAddress);
    if (tokenSymbol)  p.set("tokenSymbol",  tokenSymbol);
    if (!p.toString()) { setLoading(false); return; }

    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/markets/token-stats?${p}`, { cache: "no-store" });
        if (cancelled || !res.ok) return;
        const data = await res.json();
        if (!cancelled) { setStats(data); setLoading(false); }
      } catch { if (!cancelled) setLoading(false); }
    }

    load();
    const id = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [targetToken, tokenAddress, tokenSymbol]);

  if (!targetToken && !tokenAddress && !tokenSymbol) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-4 px-4 py-2.5 bg-surface-2/50 rounded-xl border border-white/5 mb-4 animate-pulse">
        {[80, 64, 64, 36, 36, 36, 36].map((w, i) => (
          <div key={i} className="h-7 bg-white/5 rounded" style={{ width: w }} />
        ))}
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 bg-surface-2/50 rounded-xl border border-white/5 mb-4 text-sm">
      {/* Price */}
      <div className="flex flex-col">
        <span className="text-[9px] text-white/30 mb-0.5 uppercase tracking-wider">Price</span>
        <span className="text-white font-mono font-bold text-sm">{fmtPrice(stats.priceUsd)}</span>
      </div>

      <span className="hidden sm:block w-px h-7 bg-white/10 shrink-0" />

      {/* Market cap */}
      <div className="flex flex-col">
        <span className="text-[9px] text-white/30 mb-0.5 uppercase tracking-wider">Mkt Cap</span>
        <span className="text-white/70 text-xs font-mono">{fmtLarge(stats.marketCap)}</span>
      </div>

      {/* Volume */}
      <div className="flex flex-col">
        <span className="text-[9px] text-white/30 mb-0.5 uppercase tracking-wider">Vol 24h</span>
        <span className="text-white/70 text-xs font-mono">{fmtLarge(stats.volume24h)}</span>
      </div>

      <span className="hidden sm:block w-px h-7 bg-white/10 shrink-0" />

      {/* Changes */}
      <Change v={stats.priceChange.m5}  label="5m"  />
      <Change v={stats.priceChange.h1}  label="1h"  />
      <Change v={stats.priceChange.h6}  label="6h"  />
      <Change v={stats.priceChange.h24} label="24h" />
    </div>
  );
}
