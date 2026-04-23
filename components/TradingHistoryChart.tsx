"use client";

import { useState, useEffect } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

export interface TradingHistoryBet {
  id: string;
  side: string;
  amount: number;
  result: string | null;
  payout: number | null;
  createdAt: string;
  roundQuestion: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-[#0f0f1a] border border-white/10 rounded-lg px-3 py-2 text-xs leading-5 max-w-[210px]">
      <p className="text-white/40 mb-1">{d.date} · Bet {d.name}</p>
      <p className={`font-semibold ${d.result === "Won" ? "text-[#22c55e]" : "text-red-400"}`}>{d.result}</p>
      <p className="text-white/60">Stake: <span className="text-white font-mono">{d.amount.toFixed(2)} DORA</span></p>
      <p className="text-white/60">P&L: <span className={`font-mono font-semibold ${d.profit >= 0 ? "text-[#22c55e]" : "text-red-400"}`}>{d.profit >= 0 ? "+" : ""}{d.profit.toFixed(2)}</span></p>
      <p className="text-white/60">Cumulative: <span className="font-mono text-white">{d.pnl >= 0 ? "+" : ""}{d.pnl.toFixed(2)}</span></p>
      {d.market && <p className="text-white/30 text-[10px] mt-1 truncate">{d.market}</p>}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BetBar(props: any) {
  const { x, y, width, height, value } = props;
  const fill = value >= 0 ? "#22c55e" : "#ef4444";
  const h    = Math.abs(height);
  const yPos = value >= 0 ? y : y + height - h;
  return <rect x={x} y={yPos} width={width} height={Math.max(h, 1)} fill={fill} rx={3} />;
}

export default function TradingHistoryChart({ bets }: { bets: TradingHistoryBet[] }) {
  const [animated, setAnimated] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setAnimated(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  const resolved = bets.filter(b => b.result !== null && b.result !== "refund");
  if (resolved.length === 0) return null;

  const sorted = [...resolved].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const last20 = sorted.slice(-20);

  let cumulative = 0;
  const data = last20.map((b, i) => {
    const isWin  = b.result === b.side;
    const profit = isWin ? (b.payout ?? 0) - b.amount : -b.amount;
    cumulative  += profit;
    return {
      name:   `#${i + 1}`,
      profit: parseFloat(profit.toFixed(2)),
      pnl:    parseFloat(cumulative.toFixed(2)),
      amount: b.amount,
      result: isWin ? "Won" : "Lost",
      date:   new Date(b.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
      market: b.roundQuestion?.slice(0, 40) ?? null,
    };
  });

  const totalWon  = resolved.filter(b => b.result === b.side).reduce((s, b) => s + ((b.payout ?? 0) - b.amount), 0);
  const totalLost = resolved.filter(b => b.result !== b.side).reduce((s, b) => s + b.amount, 0);
  const bestWin   = Math.max(0, ...resolved.filter(b => b.result === b.side).map(b => (b.payout ?? 0) - b.amount));
  const worstLoss = Math.max(0, ...resolved.filter(b => b.result !== b.side).map(b => b.amount));

  return (
    <div className="bg-surface border border-surface-3 rounded-xl p-4 mb-6">
      <h2 className="text-white font-semibold text-sm mb-4">Trading History</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Total Won",  value: `+${totalWon.toFixed(2)}`,  color: "text-[#22c55e]" },
          { label: "Total Lost", value: `-${totalLost.toFixed(2)}`, color: "text-red-400"   },
          { label: "Best Win",   value: `+${bestWin.toFixed(2)}`,   color: "text-[#22c55e]" },
          { label: "Worst Loss", value: `-${worstLoss.toFixed(2)}`, color: "text-red-400"   },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
            <p className="text-[10px] uppercase tracking-widest text-muted mb-1">{label}</p>
            <p className={`font-mono font-semibold text-sm ${color}`}>{value} DORA</p>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ top: 10, right: 20, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#4b5563" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "#4b5563" }} axisLine={false} tickLine={false} width={60}
            tickFormatter={v => `${v >= 0 ? "+" : ""}${v.toFixed(0)}`} allowDataOverflow={false} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
          <Legend formatter={v => <span style={{ color: "#6b7280", fontSize: 11 }}>{v}</span>} />
          <Bar dataKey="profit" name="Bet P&L" isAnimationActive={animated} shape={<BetBar />} />
          <Line type="monotone" dataKey="pnl" name="Cumulative P&L" stroke="#6366f1"
            strokeWidth={2} dot={false} isAnimationActive={animated} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
