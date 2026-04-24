"use client";

export interface TradingHistoryBet {
  id: string;
  side: string;
  amount: number;
  result: string | null;
  payout: number | null;
  createdAt: string;
  roundQuestion: string | null;
}

export default function TradingHistoryChart({ bets }: { bets: TradingHistoryBet[] }) {
  const resolved = bets.filter(b => b.result !== null && b.result !== "refund");
  if (resolved.length === 0) return null;

  const totalWon  = resolved.filter(b => b.result === b.side).reduce((s, b) => s + ((b.payout ?? 0) - b.amount), 0);
  const totalLost = resolved.filter(b => b.result !== b.side).reduce((s, b) => s + b.amount, 0);
  const bestWin   = Math.max(0, ...resolved.filter(b => b.result === b.side).map(b => (b.payout ?? 0) - b.amount));
  const worstLoss = Math.max(0, ...resolved.filter(b => b.result !== b.side).map(b => b.amount));

  const sorted = [...bets].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-muted border-b border-surface-3">
              <th className="text-left px-3 py-2">Date</th>
              <th className="text-left px-3 py-2">Market</th>
              <th className="text-center px-3 py-2">Outcome</th>
              <th className="text-right px-3 py-2">Stake</th>
              <th className="text-center px-3 py-2">Result</th>
              <th className="text-right px-3 py-2">P&L</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(b => {
              const isRefund = b.result === "refund";
              const isWin    = !isRefund && b.result !== null && b.result === b.side;
              const isLoss   = !isRefund && b.result !== null && b.result !== b.side;
              const isPending = b.result === null;
              const profit = isWin ? (b.payout ?? 0) - b.amount : isLoss ? -b.amount : null;
              const resultLabel  = isWin ? "Won" : isLoss ? "Lost" : isRefund ? "Refund" : "Pending";
              const resultColor  = isWin ? "text-[#22c55e]" : isLoss ? "text-red-400" : isPending ? "text-yellow-400" : "text-muted";
              const profitColor  = profit === null ? "text-muted" : profit >= 0 ? "text-[#22c55e]" : "text-red-400";
              return (
                <tr key={b.id} className="border-b border-surface-3/50 hover:bg-white/[0.02] transition-colors">
                  <td className="px-3 py-2.5 text-muted whitespace-nowrap">
                    {new Date(b.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
                  </td>
                  <td className="px-3 py-2.5 text-white/60 max-w-[180px] truncate">
                    {b.roundQuestion ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="font-bold text-white/80 font-mono">{b.side}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-white/80">
                    {b.amount.toFixed(2)}
                  </td>
                  <td className={`px-3 py-2.5 text-center font-semibold ${resultColor}`}>
                    {resultLabel}
                  </td>
                  <td className={`px-3 py-2.5 text-right font-mono font-semibold ${profitColor}`}>
                    {profit === null ? "—" : `${profit >= 0 ? "+" : ""}${profit.toFixed(2)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
