"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Round } from "@/lib/types";

interface BetModalProps {
  round: Round;
  side: "yes" | "no";
  onClose: () => void;
  onSuccess: () => void;
}

export default function BetModal({ round, side, onClose, onSuccess }: BetModalProps) {
  const { publicKey, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const [amount, setAmount] = useState("0.1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isYes = side === "yes";
  const odds = isYes ? (round.yesOdds ?? 2) : (round.noOdds ?? 2);
  const numAmount = parseFloat(amount) || 0;
  const payout = (numAmount * odds).toFixed(3);

  async function handleBet() {
    if (!connected || !publicKey) {
      setVisible(true);
      return;
    }
    if (numAmount <= 0) return setError("Enter a valid amount");
    setError("");
    setLoading(true);

    // In production: build + send SOL tx, get txHash from confirmation
    // For now, generate a mock txHash so the UI flow works end-to-end
    const mockTxHash = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    try {
      const res = await fetch("/api/bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: publicKey.toBase58(),
          roundId: round.id,
          side,
          amount: numAmount,
          txHash: mockTxHash,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      onSuccess();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-surface border border-surface-3 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold">Place Bet</h2>
          <button onClick={onClose} className="text-muted hover:text-white text-xl leading-none">
            ×
          </button>
        </div>

        {/* Question */}
        <p className="text-xs text-muted mb-4 leading-relaxed">{round.question}</p>

        {/* Side indicator */}
        <div
          className={`flex items-center justify-center gap-2 py-3 rounded-xl mb-4 font-bold text-lg
            ${isYes ? "bg-yes/10 text-yes border border-yes/30" : "bg-no/10 text-no border border-no/30"}`}
        >
          {isYes ? "YES" : "NO"}
          <span className="text-sm font-normal opacity-70">· {odds}x odds</span>
        </div>

        {/* Amount input */}
        <div className="mb-3">
          <label className="text-xs text-muted mb-1.5 block">Amount (SOL)</label>
          <div className="flex items-center gap-2 bg-surface-3 rounded-xl px-4 py-3 border border-surface-3 focus-within:border-brand/40">
            <span className="text-muted font-mono">◎</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 bg-transparent text-white font-mono outline-none text-sm"
              placeholder="0.00"
            />
            <span className="text-muted text-xs">SOL</span>
          </div>
        </div>

        {/* Quick amounts */}
        <div className="flex gap-2 mb-4">
          {["0.1", "0.5", "1.0", "2.0"].map((v) => (
            <button
              key={v}
              onClick={() => setAmount(v)}
              className={`flex-1 py-1 rounded-lg text-xs font-mono transition-colors
                ${amount === v ? "bg-brand/20 text-brand border border-brand/30" : "bg-surface-3 text-muted hover:text-white"}`}
            >
              {v}
            </button>
          ))}
        </div>

        {/* Payout estimate */}
        <div className="bg-surface-2 rounded-xl p-3 mb-4 flex items-center justify-between text-sm">
          <span className="text-muted">Est. payout</span>
          <span className="text-white font-mono font-semibold">◎{payout} SOL</span>
        </div>

        {error && <p className="text-no text-xs mb-3 text-center">{error}</p>}

        {/* CTA */}
        {!connected ? (
          <button
            onClick={() => setVisible(true)}
            className="w-full py-3 rounded-xl font-bold text-black bg-brand hover:bg-brand-dim transition-colors"
          >
            Connect Wallet to Bet
          </button>
        ) : (
          <button
            onClick={handleBet}
            disabled={loading || numAmount <= 0}
            className={`w-full py-3 rounded-xl font-bold transition-colors disabled:opacity-50
              ${isYes
                ? "bg-yes hover:bg-yes/80 text-black"
                : "bg-no hover:bg-no/80 text-white"}`}
          >
            {loading ? "Submitting..." : `Bet ${isYes ? "YES" : "NO"} · ◎${numAmount.toFixed(2)}`}
          </button>
        )}

        <p className="text-[10px] text-muted text-center mt-3">
          Chillo · Solana devnet · No real funds
        </p>
      </div>
    </div>
  );
}
