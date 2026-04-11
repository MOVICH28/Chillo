"use client";

import Link from "next/link";
import { useWallet } from "@/components/WalletProvider";
import { useSolBalance } from "@/lib/useSolBalance";
import { Round } from "@/lib/types";
import WinToastBanner from "@/components/WinToastBanner";

interface NavbarProps {
  rounds: Round[];
}

export default function Navbar({ rounds }: NavbarProps) {
  const { publicKey, disconnect, connected, connect } = useWallet();
  const balance = useSolBalance(connected ? publicKey : null);

  const totalPool = rounds.reduce((sum, r) => sum + r.totalPool, 0);
  const shortKey = publicKey
    ? `${publicKey.slice(0, 4)}...${publicKey.slice(-4)}`
    : null;

  return (
    <>
    <WinToastBanner />
    <nav className="fixed top-0 left-0 right-0 z-50 h-14 bg-surface border-b border-surface-3 flex items-center px-4 gap-4">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-4">
        <div className="w-7 h-7 bg-brand rounded-md flex items-center justify-center text-black font-bold text-xs">
          C
        </div>
        <span className="font-bold text-white text-lg tracking-tight">
          Chill<span className="text-brand">o</span>
        </span>
      </div>

      {/* Live indicator */}
      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-3 text-xs text-muted">
        <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse-slow" />
        LIVE
      </div>

      {/* Total pool */}
      <div className="hidden sm:flex items-center gap-1.5 text-sm text-muted">
        <span>Total Pool:</span>
        <span className="text-brand font-mono font-semibold">
          {totalPool.toFixed(1)} SOL
        </span>
      </div>

      <div className="flex-1" />

      {/* Network badge */}
      <span className="hidden md:inline-flex px-2 py-0.5 rounded text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
        devnet
      </span>

      {/* Wallet button */}
      {connected && publicKey ? (
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted font-mono">
            <span>{shortKey}</span>
            {balance !== null && (
              <>
                <span className="text-surface-3">|</span>
                <span className="text-white">{balance.toFixed(2)} SOL</span>
              </>
            )}
          </div>
          <Link
            href="/profile"
            className="px-3 py-1.5 rounded-lg text-xs bg-surface-3 text-muted hover:text-white hover:bg-surface-2 border border-surface-3 transition-colors"
          >
            Profile
          </Link>
          <button
            onClick={() => disconnect()}
            className="px-3 py-1.5 rounded-lg text-xs bg-surface-3 text-muted hover:text-white hover:bg-surface-2 border border-surface-3 transition-colors"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <button
          onClick={connect}
          className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-brand hover:bg-brand-dim text-black transition-colors"
        >
          Connect Wallet
        </button>
      )}
    </nav>
    </>
  );
}
