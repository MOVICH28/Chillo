"use client";

import { useState } from "react";
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
} from "@solana/web3.js";
import { useWallet } from "@/components/WalletProvider";
import { Round } from "@/lib/types";

interface BetModalProps {
  round: Round;
  side: "yes" | "no";
  onClose: () => void;
  onSuccess: () => void;
  solPrice?: number;
}

const PRESETS = ["0.05", "0.1", "0.5", "1"];
const PLATFORM_WALLET = "GsvhgEARAKjYX2oFRzgKpWU7XufuGPtVeN58M983prtb";
const RPC = "https://api.devnet.solana.com";
const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

type TxStatus = "idle" | "approving" | "confirming" | "registering" | "success" | "error";

const STATUS_MESSAGES: Record<TxStatus, string> = {
  idle: "",
  approving: "Waiting for approval in Phantom...",
  confirming: "Transaction submitted, confirming on-chain...",
  registering: "Confirmed! Registering your bet...",
  success: "Bet placed successfully!",
  error: "",
};

export default function BetModal({ round, side, onClose, onSuccess, solPrice }: BetModalProps) {
  const { publicKey, connected, connect } = useWallet();
  const [amount, setAmount] = useState("0.1");
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [error, setError] = useState("");

  const isYes = side === "yes";
  const odds = isYes ? (round.yesOdds ?? 2) : (round.noOdds ?? 2);
  const numAmount = parseFloat(amount) || 0;
  const payout = numAmount * odds;
  const profit = payout - numAmount;
  const usd = (sol: number) => solPrice ? ` (~$${(sol * solPrice).toFixed(2)})` : "";
  const busy = txStatus !== "idle" && txStatus !== "error";

  async function handleBet() {
    if (!connected || !publicKey) { await connect(); return; }
    if (numAmount <= 0) { setError("Enter a valid amount"); return; }

    setError("");
    setTxStatus("approving");

    try {
      const connection = new Connection(RPC, "confirmed");
      const fromPubkey = new PublicKey(publicKey);
      const toPubkey = new PublicKey(PLATFORM_WALLET);

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

      const memo = JSON.stringify({ roundId: round.id, side, walletAddress: publicKey });
      const transaction = new Transaction({
        recentBlockhash: blockhash,
        feePayer: fromPubkey,
      });

      transaction.add(
        SystemProgram.transfer({
          fromPubkey,
          toPubkey,
          lamports: Math.round(numAmount * LAMPORTS_PER_SOL),
        }),
        new TransactionInstruction({
          keys: [{ pubkey: fromPubkey, isSigner: true, isWritable: false }],
          programId: MEMO_PROGRAM_ID,
          data: Buffer.from(memo, "utf-8"),
        })
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const solana = (window as any).solana;
      const { signature } = await solana.signAndSendTransaction(transaction);

      setTxStatus("confirming");

      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      setTxStatus("registering");

      const res = await fetch("/api/bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: publicKey,
          roundId: round.id,
          side,
          amount: numAmount,
          txHash: signature,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to register bet");

      setTxStatus("success");
      window.dispatchEvent(new CustomEvent("betPlaced"));
      onSuccess();
      setTimeout(onClose, 1800);
    } catch (e: unknown) {
      setTxStatus("error");
      const msg = e instanceof Error ? e.message : "Something went wrong";
      // Phantom user rejection is verbose — simplify it
      setError(msg.includes("rejected") || msg.includes("User rejected")
        ? "Transaction rejected in Phantom."
        : msg);
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
          <div className={`flex items-center justify-center gap-2 py-3 rounded-xl mb-4 font-bold text-lg
            ${isYes ? "bg-yes/10 text-yes border border-yes/30" : "bg-no/10 text-no border border-no/30"}`}>
            {isYes ? "YES" : "NO"}
            <span className="text-sm font-normal opacity-70">· {odds}x odds</span>
          </div>

          {/* Live odds warning */}
          <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-3 py-2.5 mb-4">
            <span className="text-yellow-400 text-xs mt-0.5 shrink-0">⚡</span>
            <p className="text-yellow-300/80 text-xs leading-relaxed">
              Odds update live as bets come in. Your payout is locked at submission time.
            </p>
          </div>

          {/* Amount input */}
          <div className="mb-3">
            <label className="text-xs text-muted mb-1.5 block">Amount (SOL)</label>
            <div className="flex items-center gap-2 bg-surface-3 rounded-xl px-4 py-3 border border-surface-3 focus-within:border-brand/40">
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={busy}
                className="flex-1 bg-transparent text-white font-mono outline-none text-sm disabled:opacity-50"
                placeholder="0.00"
              />
              <span className="text-muted text-xs">SOL</span>
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
              <span className="text-white font-mono">
                {numAmount.toFixed(3)} SOL<span className="text-muted ml-1">{usd(numAmount)}</span>
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">Current odds</span>
              <span className="text-white font-mono">{odds}x</span>
            </div>
            <div className="border-t border-surface-3 pt-2 flex items-center justify-between text-sm">
              <span className="text-muted font-medium">Est. payout</span>
              <span className="text-white font-mono font-bold">
                {payout.toFixed(3)} SOL<span className="text-muted font-normal ml-1">{usd(payout)}</span>
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">Profit if win</span>
              <span className={`font-mono font-semibold ${profit >= 0 ? "text-yes" : "text-no"}`}>
                {profit >= 0 ? "+" : ""}{profit.toFixed(3)} SOL
                <span className="text-muted font-normal ml-1">{usd(profit)}</span>
              </span>
            </div>
          </div>

          {/* Transaction status */}
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
          {!connected ? (
            <button
              onClick={connect}
              className="w-full py-3 rounded-xl font-bold text-black bg-brand hover:bg-brand-dim transition-colors flex items-center justify-center gap-2"
            >
              Connect Phantom to Bet
            </button>
          ) : (
            <button
              onClick={handleBet}
              disabled={busy || numAmount <= 0}
              className={`w-full py-3 rounded-xl font-bold transition-colors disabled:opacity-50
                ${isYes ? "bg-yes hover:bg-yes/80 text-black" : "bg-no hover:bg-no/80 text-white"}`}
            >
              {busy
                ? txStatus === "success" ? "Done!" : "Processing..."
                : `Bet ${isYes ? "YES" : "NO"} · ${numAmount.toFixed(2)} SOL`}
            </button>
          )}

          <p className="text-[10px] text-muted text-center mt-3">
            Chillo · Solana devnet · Real SOL transactions
          </p>
        </div>
      </div>
    </div>
  );
}
