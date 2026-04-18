"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { useSolBalance } from "@/lib/useSolBalance";
import { Round } from "@/lib/types";
import WinToastBanner from "@/components/WinToastBanner";
import ThemeToggle from "@/components/ThemeToggle";

interface NavbarProps {
  rounds: Round[];
}

export default function Navbar({ rounds }: NavbarProps) {
  const { publicKey, disconnect, connected, connect } = useWallet();
  const balance = useSolBalance(connected ? publicKey : null);
  const [avatar, setAvatar] = useState("");
  const [username, setUsername] = useState("");

  useEffect(() => {
    if (!publicKey) { setAvatar(""); setUsername(""); return; }
    setAvatar(localStorage.getItem(`avatar_${publicKey}`) ?? "");
    setUsername(localStorage.getItem(`username_${publicKey}`) ?? "");
  }, [publicKey]);

  // Re-read when username is saved on the profile page
  useEffect(() => {
    function onUsernameChanged() {
      if (!publicKey) return;
      setAvatar(localStorage.getItem(`avatar_${publicKey}`) ?? "");
      setUsername(localStorage.getItem(`username_${publicKey}`) ?? "");
    }
    window.addEventListener("usernameChanged", onUsernameChanged);
    return () => window.removeEventListener("usernameChanged", onUsernameChanged);
  }, [publicKey]);

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
        <Image src="/logo.png" alt="Pumpdora" width={36} height={36} className="rounded-lg" />
        <span className="font-bold text-white text-lg tracking-tight">
          Pumpdor<span className="text-brand">a</span>
        </span>
      </div>

      {/* Live indicator */}
      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-3 text-xs text-muted">
        <span className="w-2 h-2 rounded-full bg-[#22c55e] pulse-dot" />
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

      {/* Nav links */}
      <Link href="/leaderboard" className="hidden sm:inline-flex items-center gap-1 text-xs text-muted hover:text-white transition-colors">
        🏆 <span>Leaderboard</span>
      </Link>
      <Link href="/faq" className="hidden sm:inline-flex items-center gap-1 text-xs text-muted hover:text-white transition-colors">
        <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center font-bold leading-none text-[10px]">?</span>
        <span>FAQ</span>
      </Link>

      {/* Network badge */}
      <span className="hidden md:inline-flex px-2 py-0.5 rounded text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
        devnet
      </span>

      {/* Theme toggle */}
      <ThemeToggle />

      {/* Wallet button */}
      {connected && publicKey ? (
        <div className="flex items-center gap-2">
          {/* Avatar */}
          <div className="w-8 h-8 rounded-full overflow-hidden border border-surface-3 shrink-0">
            {avatar ? (
              <img src={avatar} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-brand/20 flex items-center justify-center text-brand font-bold text-[10px] select-none">
                {publicKey?.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono">
            <span className={username ? "text-white font-semibold" : "text-muted"}>{username || shortKey}</span>
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
