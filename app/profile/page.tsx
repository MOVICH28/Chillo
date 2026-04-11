"use client";

export const dynamic = "force-dynamic";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/components/WalletProvider";
import { useSolBalance } from "@/lib/useSolBalance";
import { useLiveData } from "@/lib/useLiveData";

interface BetWithRound {
  id: string;
  roundId: string;
  walletAddress: string;
  side: string;
  amount: number;
  odds: number;
  txHash: string;
  createdAt: string;
  result: string | null;
  payout: number | null;
  paid: boolean;
  round: { question: string; status: string } | null;
}

interface ReferralStats {
  referralCount: number;
  totalEarned: number;
  referrals: { referredAddress: string; createdAt: string }[];
}

function resultLabel(bet: BetWithRound): { label: string; color: string } {
  if (bet.result === null) return { label: "Pending", color: "text-yellow-400" };
  const won = bet.result === bet.side;
  return won
    ? { label: "WIN", color: "text-yes" }
    : { label: "LOSS", color: "text-no" };
}

const BASE_URL = "https://chillo-f11o.vercel.app";

// ── Chart helpers ─────────────────────────────────────────────────────────────

const TOOLTIP_STYLE: React.CSSProperties = {
  position: "absolute",
  background: "#0f0f1a",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 11,
  color: "#e5e7eb",
  pointerEvents: "none",
  whiteSpace: "nowrap",
  zIndex: 50,
  boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
};


function DonutChart({
  wins, losses, pending, bets, solPrice,
}: {
  wins: number; losses: number; pending: number;
  bets: BetWithRound[]; solPrice: number | null;
}) {
  const total = wins + losses + pending;
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: React.ReactNode } | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);

  if (total === 0) return <p className="text-xs text-muted text-center py-4">No bets yet</p>;

  const cx = 60, cy = 60, r = 42, sw = 16;
  const circ = 2 * Math.PI * r;

  const winSOL  = bets.filter(b => b.result === b.side && b.result !== null).reduce((s, b) => s + ((b.payout ?? 0) - b.amount), 0);
  const lossSOL = bets.filter(b => b.result !== null && b.result !== b.side).reduce((s, b) => s + b.amount, 0);

  const segments = [
    {
      count: wins, color: "#22c55e", label: "Wins",
      content: (
        <div>
          <div style={{ color: "#22c55e", fontWeight: 700 }}>Wins: {wins} bets</div>
          <div>+{winSOL.toFixed(3)} SOL</div>
          {solPrice && <div style={{ color: "#6b7280" }}>${(winSOL * solPrice).toFixed(2)}</div>}
        </div>
      ),
    },
    {
      count: losses, color: "#ef4444", label: "Losses",
      content: (
        <div>
          <div style={{ color: "#ef4444", fontWeight: 700 }}>Losses: {losses} bets</div>
          <div>-{lossSOL.toFixed(3)} SOL</div>
          {solPrice && <div style={{ color: "#6b7280" }}>-${(lossSOL * solPrice).toFixed(2)}</div>}
        </div>
      ),
    },
    {
      count: pending, color: "#374151", label: "Pending",
      content: (
        <div>
          <div style={{ color: "#9ca3af", fontWeight: 700 }}>Pending: {pending} bets</div>
          <div style={{ color: "#6b7280" }}>Awaiting resolution</div>
        </div>
      ),
    },
  ].filter(s => s.count > 0);

  let startAngle = -90;
  const winPct = Math.round((wins / total) * 100);

  function arcPath(startDeg: number, endDeg: number) {
    const pct = (endDeg - startDeg) / 360;
    return { dash: pct * circ, gap: circ, rotate: startDeg };
  }

  function handleSegmentEnter(e: React.MouseEvent<SVGCircleElement>, idx: number) {
    setHoveredIdx(idx);
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    // Place tooltip near mouse relative to wrapper div
    setTooltip({
      x: e.clientX - rect.left + 12,
      y: e.clientY - rect.top - 10,
      content: segments[idx].content,
    });
  }

  function handleMouseMove(e: React.MouseEvent<SVGCircleElement>) {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    setTooltip(prev => prev ? {
      ...prev,
      x: e.clientX - rect.left + 12,
      y: e.clientY - rect.top - 10,
    } : null);
  }

  function handleSegmentLeave() {
    setHoveredIdx(null);
    setTooltip(null);
  }

  return (
    <div className="flex flex-col items-center gap-2 relative">
      <div className="relative">
        <svg ref={svgRef} viewBox="0 0 120 120" className="w-28 h-28 shrink-0" style={{ overflow: "visible" }}>
          {segments.map((seg, i) => {
            const pct = seg.count / total;
            const angle = startAngle;
            startAngle += pct * 360;
            const { dash, gap, rotate } = arcPath(angle, angle + pct * 360);
            const isHovered = hoveredIdx === i;
            return (
              <circle
                key={i}
                cx={cx} cy={cy} r={isHovered ? r + 3 : r}
                fill="none"
                stroke={seg.color}
                strokeWidth={isHovered ? sw + 4 : sw}
                strokeDasharray={`${dash} ${gap}`}
                transform={`rotate(${rotate}, ${cx}, ${cy})`}
                style={{ cursor: "pointer", transition: "r 0.15s, stroke-width 0.15s" }}
                onMouseEnter={e => handleSegmentEnter(e, i)}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleSegmentLeave}
              />
            );
          })}
          <text x={cx} y={cy - 4}  textAnchor="middle" fill="white"   fontSize="15" fontWeight="bold">{winPct}%</text>
          <text x={cx} y={cy + 11} textAnchor="middle" fill="#6b7280"  fontSize="8">win rate</text>
        </svg>
        {tooltip && (
          <div style={{ ...TOOLTIP_STYLE, left: tooltip.x, top: tooltip.y }}>
            {tooltip.content}
          </div>
        )}
      </div>
      <div className="flex gap-3 text-[10px] text-muted">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: "#22c55e" }} />{wins}W</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: "#ef4444" }} />{losses}L</span>
        {pending > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: "#374151" }} />{pending}P</span>}
      </div>
    </div>
  );
}

function BetBars({ bets, solPrice }: { bets: BetWithRound[]; solPrice: number | null }) {
  if (bets.length === 0) return <p className="text-xs text-muted text-center py-4">No data</p>;

  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: React.ReactNode } | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  const bars = bets.map(b => {
    if (b.result === null) return { value: 0, color: "#374151", bet: b };
    if (b.result === b.side)  return { value: (b.payout ?? 0) - b.amount, color: "#22c55e", bet: b };
    return { value: -b.amount, color: "#ef4444", bet: b };
  });

  const maxAbs = Math.max(...bars.map(d => Math.abs(d.value)), 0.01);
  const W = 300, H = 90, pad = 8;
  const usableW = W - pad * 2;
  const halfH = (H - pad * 2) / 2;
  const zeroY = pad + halfH;
  const slotW = usableW / bars.length;
  const barW = Math.max(2, slotW - 2);

  function handleBarEnter(e: React.MouseEvent<SVGRectElement>, i: number) {
    setHoveredIdx(i);
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const b = bars[i].bet;
    const isWin  = b.result !== null && b.result === b.side;
    const isLoss = b.result !== null && b.result !== b.side;
    const profit = isWin ? (b.payout ?? 0) - b.amount : isLoss ? -b.amount : 0;
    const question = b.round?.question ?? b.roundId;
    const shortQ = question.length > 40 ? question.slice(0, 40) + "…" : question;
    setTooltip({
      x: e.clientX - rect.left + 10,
      y: e.clientY - rect.top - 10,
      content: (
        <div>
          <div style={{ color: "#9ca3af", marginBottom: 4, maxWidth: 180 }}>{shortQ}</div>
          <div>
            Side: <span style={{ color: b.side === "yes" ? "#22c55e" : "#ef4444", fontWeight: 700 }}>
              {b.side.toUpperCase()}
            </span>
          </div>
          <div>Amount: {b.amount.toFixed(3)} SOL{solPrice ? ` ($${(b.amount * solPrice).toFixed(2)})` : ""}</div>
          {isWin && b.payout != null && (
            <div style={{ color: "#22c55e" }}>Payout: +{b.payout.toFixed(3)} SOL</div>
          )}
          {isWin && (
            <div style={{ color: "#22c55e", fontWeight: 700 }}>
              Profit: +{profit.toFixed(3)} SOL{solPrice ? ` (+$${(profit * solPrice).toFixed(2)})` : ""}
            </div>
          )}
          {isLoss && (
            <div style={{ color: "#ef4444", fontWeight: 700 }}>
              Loss: {profit.toFixed(3)} SOL{solPrice ? ` (-$${Math.abs(profit * (solPrice ?? 0)).toFixed(2)})` : ""}
            </div>
          )}
          {!isWin && !isLoss && (
            <div style={{ color: "#9ca3af" }}>Pending resolution</div>
          )}
        </div>
      ),
    });
  }

  function handleBarMove(e: React.MouseEvent<SVGRectElement>) {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    setTooltip(prev => prev ? { ...prev, x: e.clientX - rect.left + 10, y: e.clientY - rect.top - 10 } : null);
  }

  function handleBarLeave() {
    setHoveredIdx(null);
    setTooltip(null);
  }

  return (
    <div ref={wrapRef} className="relative">
      <p className="text-[10px] text-muted mb-1">Profit / Loss per bet</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <line x1={pad} y1={zeroY} x2={W - pad} y2={zeroY} stroke="#374151" strokeWidth={1} />
        {bars.map((b, i) => {
          const bh = (Math.abs(b.value) / maxAbs) * halfH;
          const x  = pad + i * slotW + (slotW - barW) / 2;
          const y  = b.value >= 0 ? zeroY - bh : zeroY;
          const isHovered = hoveredIdx === i;
          return (
            <rect
              key={i} x={x} y={y} width={barW} height={Math.max(bh, 2)}
              fill={b.color} opacity={isHovered ? 1 : 0.75} rx={1}
              style={{ cursor: "pointer" }}
              onMouseEnter={e => handleBarEnter(e, i)}
              onMouseMove={handleBarMove}
              onMouseLeave={handleBarLeave}
            />
          );
        })}
      </svg>
      {tooltip && (
        <div style={{ ...TOOLTIP_STYLE, left: tooltip.x, top: tooltip.y }}>
          {tooltip.content}
        </div>
      )}
    </div>
  );
}

function PnLLine({ bets, solPrice }: { bets: BetWithRound[]; solPrice: number | null }) {
  if (bets.length === 0) return null;

  const [hovered, setHovered] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: React.ReactNode } | null>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  let cum = 0;
  // points[0] = 0 (start), points[i+1] = cumulative after bets[i]
  const points = [0, ...bets.map(b => {
    if (b.result !== null) {
      cum += b.result === b.side ? (b.payout ?? 0) - b.amount : -b.amount;
    }
    return cum;
  })];

  const W = 300, H = 80, pad = 10;
  const minV = Math.min(...points);
  const maxV = Math.max(...points);
  const range = Math.max(maxV - minV, 0.001);
  const toX = (i: number) => pad + (i / (points.length - 1)) * (W - pad * 2);
  const toY = (v: number) => pad + ((maxV - v) / range) * (H - pad * 2);

  const pathD   = points.map((p, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(p).toFixed(1)}`).join(" ");
  const finalPnL = points[points.length - 1];
  const color   = finalPnL >= 0 ? "#22c55e" : "#ef4444";
  const zeroY   = toY(0);

  const fillD = `${pathD} L${toX(points.length - 1).toFixed(1)},${zeroY.toFixed(1)} L${toX(0).toFixed(1)},${zeroY.toFixed(1)} Z`;

  // Hit-area per data point: invisible wide rect column
  const hitW = (W - pad * 2) / Math.max(points.length - 1, 1);

  function handlePointEnter(e: React.MouseEvent, idx: number) {
    setHovered(idx);
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const pnl = points[idx];
    // idx 0 = start (no bet), idx 1..n = after bets[idx-1]
    const bet = idx > 0 ? bets[idx - 1] : null;
    const date = bet ? new Date(bet.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Start";
    setTooltip({
      x: e.clientX - rect.left + 12,
      y: e.clientY - rect.top - 10,
      content: (
        <div>
          <div style={{ color: "#6b7280", marginBottom: 3 }}>{date}</div>
          {bet && (
            <>
              <div>
                {bet.result === bet.side && bet.result !== null
                  ? <span style={{ color: "#22c55e" }}>WIN</span>
                  : bet.result !== null
                    ? <span style={{ color: "#ef4444" }}>LOSS</span>
                    : <span style={{ color: "#9ca3af" }}>Pending</span>}
                {" "}
                <span style={{ color: "#9ca3af" }}>{bet.side.toUpperCase()}</span>
              </div>
              <div>Bet: {bet.amount.toFixed(3)} SOL</div>
            </>
          )}
          <div style={{ fontWeight: 700, color: pnl >= 0 ? "#22c55e" : "#ef4444", marginTop: 2 }}>
            Running total: {pnl >= 0 ? "+" : ""}{pnl.toFixed(3)} SOL
            {solPrice ? ` (${ pnl >= 0 ? "+" : ""}${(pnl * solPrice).toFixed(2)})` : ""}
          </div>
        </div>
      ),
    });
  }

  function handlePointMove(e: React.MouseEvent) {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    setTooltip(prev => prev ? { ...prev, x: e.clientX - rect.left + 12, y: e.clientY - rect.top - 10 } : null);
  }

  function handlePointLeave() {
    setHovered(null);
    setTooltip(null);
  }

  return (
    <div ref={wrapRef} className="relative">
      <p className="text-[10px] text-muted mb-1">Cumulative P&amp;L</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: "visible" }}>
        {zeroY >= pad && zeroY <= H - pad && (
          <line x1={pad} y1={zeroY} x2={W - pad} y2={zeroY} stroke="#374151" strokeWidth={1} strokeDasharray="3 3" />
        )}
        <path d={fillD} fill={color} opacity={0.12} />
        <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {/* Crosshair + highlighted point */}
        {hovered !== null && (() => {
          const hx = toX(hovered);
          const hy = toY(points[hovered]);
          return (
            <>
              <line x1={hx} y1={pad} x2={hx} y2={H - pad} stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="3 3" />
              <circle cx={hx} cy={hy} r={5} fill={color} stroke="#0f0f1a" strokeWidth={2} />
            </>
          );
        })()}

        {/* Invisible hit areas for each point */}
        {points.map((_, idx) => {
          const hx = toX(idx);
          return (
            <rect
              key={idx}
              x={hx - hitW / 2} y={pad}
              width={hitW} height={H - pad * 2}
              fill="transparent"
              style={{ cursor: "crosshair" }}
              onMouseEnter={e => handlePointEnter(e, idx)}
              onMouseMove={handlePointMove}
              onMouseLeave={handlePointLeave}
            />
          );
        })}

        {/* Always-visible endpoint dot */}
        {hovered === null && (
          <circle cx={toX(points.length - 1)} cy={toY(finalPnL)} r={3} fill={color} />
        )}
      </svg>
      <p className="text-[10px] text-right mt-0.5">
        <span className={finalPnL >= 0 ? "text-yes font-mono" : "text-no font-mono"}>
          {finalPnL >= 0 ? "+" : ""}{finalPnL.toFixed(3)} SOL
          {solPrice ? ` ($${(finalPnL * solPrice).toFixed(2)})` : ""}
        </span>
      </p>
      {tooltip && (
        <div style={{ ...TOOLTIP_STYLE, left: tooltip.x, top: tooltip.y }}>
          {tooltip.content}
        </div>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const { publicKey, connected, connect } = useWallet();
  const balance = useSolBalance(connected ? publicKey : null);
  const { data: liveData } = useLiveData();
  const solPrice = liveData.sol?.price ?? null;

  const [mounted, setMounted] = useState(false);
  const [bets, setBets] = useState<BetWithRound[]>([]);
  const [betsLoading, setBetsLoading] = useState(false);
  const [refStats, setRefStats] = useState<ReferralStats | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const fetchBets = useCallback(() => {
    if (!publicKey) return;
    fetch(`/api/bets?wallet=${publicKey}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setBets(data);
          setBetsLoading(false);
        }
      })
      .catch(() => setBetsLoading(false));
  }, [publicKey]);

  useEffect(() => {
    if (!publicKey) return;
    setBetsLoading(true);
    fetchBets();
    const id = setInterval(fetchBets, 10000);

    fetch(`/api/referral?wallet=${publicKey}`)
      .then((r) => r.json())
      .then((data) => { if (data && typeof data.referralCount === "number") setRefStats(data); })
      .catch(() => {});

    return () => clearInterval(id);
  }, [publicKey, fetchBets]);

  const totalWagered = bets.reduce((s, b) => s + b.amount, 0);
  const resolvedBets = bets.filter((b) => b.result !== null);
  const wins = resolvedBets.filter((b) => b.result === b.side);
  const winRate = resolvedBets.length > 0
    ? ((wins.length / resolvedBets.length) * 100).toFixed(0)
    : "0";

  const usd = (sol: number) => solPrice ? `$${(sol * solPrice).toFixed(2)}` : "—";

  // Referral link uses short wallet prefix as code
  const refCode = publicKey ?? "";
  const refLink = `${BASE_URL}/?ref=${refCode}`;

  function copyRefLink() {
    navigator.clipboard.writeText(refLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (!mounted || !connected || !publicKey) {
    return (
      <div className="min-h-screen bg-base flex flex-col items-center justify-center gap-4">
        <p className="text-white text-lg font-semibold">Connect your wallet to view your profile</p>
        <button
          onClick={connect}
          className="px-6 py-2.5 rounded-xl font-bold text-black bg-brand hover:bg-brand-dim transition-colors"
        >
          Connect Wallet
        </button>
        <Link href="/" className="text-muted text-sm hover:text-white transition-colors">← Back to markets</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base pt-14">
      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-white font-bold text-2xl">Profile</h1>
            <p className="text-muted text-sm mt-0.5 font-mono">{publicKey}</p>
          </div>
          <Link href="/" className="text-muted text-sm hover:text-white transition-colors">← Markets</Link>
        </div>

        {/* Wallet card */}
        <div className="bg-surface border border-surface-3 rounded-xl p-4 mb-6 flex flex-wrap items-center gap-6">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted mb-1">Wallet</p>
            <p className="text-white font-mono text-sm">
              {publicKey.slice(0, 8)}...{publicKey.slice(-8)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted mb-1">Balance</p>
            <p className="text-brand font-mono font-semibold">
              {balance !== null ? `${balance.toFixed(4)} SOL` : "—"}
              {balance !== null && solPrice && (
                <span className="text-muted font-normal ml-2 text-xs">{usd(balance)}</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted mb-1">Network</p>
            <span className="px-2 py-0.5 rounded text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">devnet</span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total Bets", value: bets.length.toString() },
            { label: "Total Wagered", value: `${totalWagered.toFixed(3)} SOL` },
            { label: "Wins / Losses", value: `${wins.length} / ${resolvedBets.length - wins.length}` },
            { label: "Win Rate", value: `${winRate}%` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-surface border border-surface-3 rounded-xl p-3">
              <p className="text-[10px] uppercase tracking-widest text-muted mb-1">{label}</p>
              <p className="text-white font-semibold font-mono">{value}</p>
            </div>
          ))}
        </div>

        {/* Charts */}
        {bets.length > 0 && (
          <div className="bg-surface border border-surface-3 rounded-xl p-4 mb-6">
            <h2 className="text-white font-semibold text-sm mb-4">Performance</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <DonutChart
                wins={wins.length}
                losses={resolvedBets.length - wins.length}
                pending={bets.length - resolvedBets.length}
                bets={bets}
                solPrice={solPrice}
              />
              <BetBars bets={bets} solPrice={solPrice} />
              <PnLLine bets={bets} solPrice={solPrice} />
            </div>
          </div>
        )}

        {/* Referral section */}
        <div id="referral" className="bg-surface border border-surface-3 rounded-xl overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-surface-3 flex items-center gap-2">
            <span className="text-brand text-sm">🔗</span>
            <h2 className="text-white font-semibold">Referral Program</h2>
          </div>
          <div className="p-4 space-y-4">

            {/* How it works */}
            <div className="flex flex-col sm:flex-row gap-3 text-xs text-muted">
              {[
                { icon: "🔗", text: "Share your unique link" },
                { icon: "💸", text: "Earn 1% of every bet they place" },
              ].map(({ icon, text }) => (
                <div key={text} className="flex items-center gap-2 bg-surface-2 rounded-lg px-3 py-2 flex-1">
                  <span>{icon}</span>
                  <span>{text}</span>
                </div>
              ))}
            </div>

            {/* Referral link */}
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Your referral link</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-surface-2 border border-surface-3 rounded-lg px-3 py-2 font-mono text-xs text-muted truncate">
                  {refLink}
                </div>
                <button
                  onClick={copyRefLink}
                  className={`shrink-0 px-3 py-2 rounded-lg text-xs font-semibold transition-colors
                    ${copied
                      ? "bg-yes/20 text-yes border border-yes/30"
                      : "bg-brand hover:bg-brand-dim text-black"}`}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            {/* Referral stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-surface-2 border border-surface-3 rounded-xl p-3">
                <p className="text-[10px] uppercase tracking-widest text-muted mb-1">People Invited</p>
                <p className="text-white font-bold font-mono text-lg">
                  {refStats?.referralCount ?? 0}
                </p>
              </div>
              <div className="bg-surface-2 border border-surface-3 rounded-xl p-3">
                <p className="text-[10px] uppercase tracking-widest text-muted mb-1">Total Earned</p>
                <p className="text-brand font-bold font-mono text-lg">
                  {(refStats?.totalEarned ?? 0).toFixed(4)} SOL
                </p>
                {solPrice && refStats && refStats.totalEarned > 0 && (
                  <p className="text-muted text-[10px] mt-0.5">{usd(refStats.totalEarned)}</p>
                )}
              </div>
            </div>

            <p className="text-[10px] text-muted">
              Earn <span className="text-brand">1% of every bet</span> placed by wallets you refer. Paid automatically in SOL.
            </p>
          </div>
        </div>

        {/* Bet history */}
        <div className="bg-surface border border-surface-3 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-3">
            <h2 className="text-white font-semibold">Bet History</h2>
          </div>

          {betsLoading ? (
            <div className="p-8 text-center text-muted text-sm">Loading…</div>
          ) : bets.length === 0 ? (
            <div className="p-12 flex flex-col items-center gap-2">
              <p className="text-3xl">🎯</p>
              <p className="text-white font-semibold mt-1">No bets yet</p>
              <p className="text-muted text-sm">Head back to markets and place your first bet.</p>
              <Link
                href="/"
                className="mt-3 px-4 py-2 rounded-lg text-sm font-semibold bg-brand hover:bg-brand-dim text-black transition-colors"
              >
                Browse Markets
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest text-muted border-b border-surface-3">
                    <th className="text-left px-4 py-2.5">Market</th>
                    <th className="text-center px-3 py-2.5">Side</th>
                    <th className="text-right px-3 py-2.5">Amount</th>
                    <th className="text-right px-3 py-2.5">Odds</th>
                    <th className="text-right px-3 py-2.5">Est. Payout</th>
                    <th className="text-center px-3 py-2.5">Status</th>
                    <th className="text-right px-4 py-2.5">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {bets.map((bet) => {
                    const { label, color } = resultLabel(bet);
                    const isWin = bet.result !== null && bet.result === bet.side;
                    const isLoss = bet.result !== null && bet.result !== bet.side;
                    const estPayout = bet.amount * bet.odds;
                    return (
                      <tr key={bet.id} className="border-b border-surface-3/50 hover:bg-surface-2/50 transition-colors">
                        <td className="px-4 py-3 text-muted text-xs">
                          {bet.round?.question ?? bet.roundId}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                            bet.side === "yes" ? "bg-yes/10 text-yes" : "bg-no/10 text-no"
                          }`}>
                            {bet.side.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-white text-xs">
                          {bet.amount.toFixed(3)} SOL
                          {solPrice && (
                            <div className="text-muted text-[10px]">{usd(bet.amount)}</div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-muted text-xs">
                          {bet.odds.toFixed(2)}x
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs">
                          {isWin && bet.payout != null ? (
                            <>
                              <span className="text-yes font-semibold">+{bet.payout.toFixed(3)} SOL</span>
                              {solPrice && <div className="text-muted text-[10px]">{usd(bet.payout)}</div>}
                            </>
                          ) : isLoss ? (
                            <span className="text-muted">—</span>
                          ) : (
                            <>
                              <span className="text-white">{estPayout.toFixed(3)} SOL</span>
                              {solPrice && <div className="text-muted text-[10px]">{usd(estPayout)}</div>}
                            </>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`text-xs font-semibold ${color}`}>{label}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-muted text-xs">
                          {new Date(bet.createdAt).toLocaleString('ru-RU', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit'})}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
