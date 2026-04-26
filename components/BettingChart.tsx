"use client";

import { useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";

const OUTCOME_COLORS: Record<string, string> = {
  A: "#f87171",
  B: "#fb923c",
  C: "#facc15",
  D: "#4ade80",
  E: "#38bdf8",
  F: "#c084fc",
};

interface TradePoint {
  minutesSinceStart: number;
  probabilities: Record<string, number>;
}

interface ChartRow {
  min: number;
  [outcome: string]: number;
}

interface TradesResponse {
  outcomeIds: string[];
  points: TradePoint[];
}

interface Props {
  roundId: string;
  outcomes: { id: string; label: string }[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#13151b] border border-white/10 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-white/40 mb-1.5">{label}m in</p>
      {payload.map((p: { name: string; value: number; color: string }) => (
        <div key={p.name} className="flex items-center gap-2 mb-0.5">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-white/60">{p.name}</span>
          <span className="text-white font-mono font-semibold ml-auto pl-3">{p.value.toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}

export default function BettingChart({ roundId, outcomes }: Props) {
  const [data, setData] = useState<ChartRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchTrades() {
    try {
      const res = await fetch(`/api/rounds/${roundId}/trades`, { cache: "no-store" });
      if (!res.ok) return;
      const json: TradesResponse = await res.json();
      const rows: ChartRow[] = json.points.map(pt => ({
        min: pt.minutesSinceStart,
        ...Object.fromEntries(
          Object.entries(pt.probabilities).map(([k, v]) => [k, v])
        ),
      }));
      setData(rows);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTrades();
    const id = setInterval(fetchTrades, 30_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId]);

  if (loading) {
    return (
      <div className="h-[300px] flex items-center justify-center bg-[#0d0f14] rounded-xl border border-white/5">
        <span className="text-white/30 text-sm">Loading chart…</span>
      </div>
    );
  }

  if (data.length <= 1) {
    return (
      <div className="h-[300px] flex flex-col items-center justify-center bg-[#0d0f14] rounded-xl border border-white/5 gap-2">
        <span className="text-white/20 text-2xl">📊</span>
        <span className="text-white/30 text-sm">No trades yet — chart will appear after the first bet</span>
      </div>
    );
  }

  return (
    <div className="bg-[#0d0f14] rounded-xl border border-white/5 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-white/60 text-xs uppercase tracking-wider">Outcome Probabilities</p>
        <p className="text-white/30 text-[10px]">Updates every 30s</p>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="min"
            tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
            tickFormatter={v => `${v}m`}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={v => `${v}%`}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={100 / outcomes.length} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
          {outcomes.map(o => (
            <Line
              key={o.id}
              type="monotone"
              dataKey={o.id}
              name={`${o.id}: ${o.label}`}
              stroke={OUTCOME_COLORS[o.id] ?? "#888"}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          ))}
          <Legend
            formatter={(value) => <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 10 }}>{value}</span>}
            iconType="circle"
            iconSize={6}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
