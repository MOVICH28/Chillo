"use client";

import { useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { Round, Outcome } from "@/lib/types";

interface BetModalProps {
  round: Round;
  side: string;       // "yes" | "no" | "A" | "B" | "C" | "D"
  outcome?: Outcome;  // set for range rounds
  onClose: () => void;
  onSuccess: () => void;
}

const PRESETS = ["50", "100", "250", "500"];

type TxStatus = "idle" | "placing" | "success" | "error";

const STATUS_MESSAGES: Record<TxStatus, string> = {
  idle: "",
  placing: "Placing your bet…",
  success: "Bet placed successfully!",
  error: "",
};

export default function BetModal({ round, side, outcome, onClose, onSuccess }: BetModalProps) {
  const { user, getToken, refreshUser } = useAuth();
  const [amount, setAmount] = useState("100");
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [error, setError] = useState("");

  const isRange = !!outcome;
  const isYes   = side === "yes";

  const rangeOdds = isRange && outcome && round.totalPool > 0 && outcome.pool > 0
    ? Math.max(1.05, (round.totalPool * 0.95) / outcome.pool)
    : null;

  const odds = isRange
    ? (rangeOdds ?? 2)
    : (isYes ? (round.yesOdds ?? 2) : (round.noOdds ?? 2));
  const numAmount = parseFloat(amount) || 0;
  const payout = numAmount * odds;
  const profit = payout - numAmount;

  const busy = txStatus === "placing";

  async function handleBet() {
    if (!user) { setError("Login to place a bet"); return; }
    if (numAmount <= 0) { setError("Enter a valid amount"); return; }
    if (numAmount > user.doraBalance) { setError("Insufficient DORA balance"); return; }

    setError("");
    setTxStatus("placing");

    try {
      const token = getToken();
      const res = await fetch("/api/bets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          currency: "DORA",
          roundId: round.id,
          side,
          amount: numAmount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to place bet");

      setTxStatus("success");
      await refreshUser();
      window.dispatchEvent(new CustomEvent("betPlaced"));
      onSuccess();
      setTimeout(onClose, 1800);
    } catch (e: unknown) {
      setTxStatus("error");
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div className="bg-surface border border-surface-3 rounded-2xl w-full max-w-sm shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold">Place Bet</h2>
            <button onClick={onClose} disabled={busy} className="text-muted hover:text-white text-xl leading-none disabled:opacity-30">
              ×
            </button>
          </div>

          {/* Question */}
          <p className="text-xs text-muted mb-4 leading-relaxed">{round.question}</p>

          {/* Side indicator */}
          {isRange && outcome ? (
            <div className="flex items-center justify-center gap-2 py-3 rounded-xl mb-4 font-bold text-lg bg-brand/10 text-brand border border-brand/30">
              <span className="px-2 py-0.5 rounded bg-brand/20 text-sm font-bold">{outcome.id}</span>
              <span className="text-sm font-normal max-w-[180px] truncate">{outcome.label}</span>
              {rangeOdds && <span className="text-sm font-normal opacity-70">· {rangeOdds.toFixed(2)}x</span>}
              {!rangeOdds && <span className="text-sm font-normal opacity-50">· first bet</span>}
            </div>
          ) : (
            <div className={`flex items-center justify-center gap-2 py-3 rounded-xl mb-4 font-bold text-lg
              ${isYes ? "bg-yes/10 text-yes border border-yes/30" : "bg-no/10 text-no border border-no/30"}`}>
              {isYes ? "YES" : "NO"}
              <span className="text-sm font-normal opacity-70">· {odds}x odds</span>
            </div>
          )}

          {/* Live odds warning */}
          <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-3 py-2.5 mb-4">
            <span className="text-yellow-400 text-xs mt-0.5 shrink-0">⚡</span>
            <p className="text-yellow-300/80 text-xs leading-relaxed">
              Odds update live as bets come in. Your payout is locked at submission time.
            </p>
          </div>

          {/* Balance */}
          {user && (
            <div className="flex items-center justify-between text-xs text-muted mb-3">
              <span>Your balance</span>
              <span className="text-brand font-mono font-semibold">{Math.floor(user.doraBalance).toLocaleString()} DORA</span>
            </div>
          )}

          {/* Amount input */}
          <div className="mb-3">
            <label className="text-xs text-muted mb-1.5 block">Amount (DORA)</label>
            <div className="flex items-center gap-2 bg-surface-3 rounded-xl px-4 py-3 border border-surface-3 focus-within:border-brand/40">
              <input
                type="number"
                min="1"
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={busy}
                className="flex-1 bg-transparent text-white font-mono outline-none text-sm disabled:opacity-50"
                placeholder="0"
              />
              <span className="text-muted text-xs">DORA</span>
            </div>
          </div>

          {/* Quick presets */}
          <div className="flex gap-2 mb-4">
            {PRESETS.map((v) => (
              <button
                key={v}
                onClick={() => setAmount(v)}
                disabled={busy}
                className={`flex-1 py-1.5 rounded-lg text-xs font-mono transition-colors disabled:opacity-40
                  ${amount === v
                    ? "bg-brand/20 text-brand border border-brand/30"
                    : "bg-surface-3 text-muted hover:text-white border border-transparent"}`}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Payout calculator */}
          <div className="bg-surface-2 rounded-xl p-3 mb-4 space-y-2 border border-surface-3/50">
            <p className="text-[10px] text-muted uppercase tracking-wider font-medium mb-2">Payout calculator</p>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">Stake</span>
              <span className="text-white font-mono">{numAmount.toFixed(0)} DORA</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">Current odds</span>
              <span className="text-white font-mono">{odds}x</span>
            </div>
            <div className="border-t border-surface-3 pt-2 flex items-center justify-between text-sm">
              <span className="text-muted font-medium">Est. payout</span>
              <span className="text-white font-mono font-bold">{payout.toFixed(0)} DORA</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">Profit if win</span>
              <span className={`font-mono font-semibold ${profit >= 0 ? "text-yes" : "text-no"}`}>
                {profit >= 0 ? "+" : ""}{profit.toFixed(0)} DORA
              </span>
            </div>
          </div>

          {/* Status */}
          {txStatus !== "idle" && txStatus !== "error" && (
            <div className={`flex items-center gap-2 rounded-xl px-3 py-2.5 mb-4 text-xs
              ${txStatus === "success"
                ? "bg-yes/10 border border-yes/30 text-yes"
                : "bg-brand/10 border border-brand/20 text-brand"}`}>
              {txStatus !== "success" && (
                <svg className="animate-spin w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              )}
              {txStatus === "success" && <span>✓</span>}
              {STATUS_MESSAGES[txStatus]}
            </div>
          )}

          {error && <p className="text-no text-xs mb-3 text-center">{error}</p>}

          {/* CTA */}
          {!user ? (
            <p className="text-center text-muted text-sm py-2">
              <button onClick={onClose} className="text-brand hover:underline">Login</button> to place a bet
            </p>
          ) : (
            <button
              onClick={handleBet}
              disabled={busy || numAmount <= 0}
              className={`w-full py-3 rounded-xl font-bold transition-colors disabled:opacity-50
                ${isRange
                  ? "bg-brand hover:bg-brand-dim text-black"
                  : isYes
                    ? "bg-yes hover:bg-yes/80 text-black"
                    : "bg-no hover:bg-no/80 text-white"
                }`}
            >
              {busy
                ? "Processing..."
                : isRange
                  ? `Bet ${outcome?.id} · ${numAmount.toFixed(0)} DORA`
                  : `Bet ${isYes ? "YES" : "NO"} · ${numAmount.toFixed(0)} DORA`}
            </button>
          )}

          <p className="text-[10px] text-muted text-center mt-3">
            Pumpdora · DORA virtual currency · No real money needed
          </p>
        </div>
      </div>
    </div>
  );
}
