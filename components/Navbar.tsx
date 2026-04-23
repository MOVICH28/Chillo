"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { useAuth } from "@/lib/useAuth";
import { useSolBalance } from "@/lib/useSolBalance";
import { Round } from "@/lib/types";
import WinToastBanner from "@/components/WinToastBanner";
import ThemeToggle from "@/components/ThemeToggle";
import AuthModal from "@/components/AuthModal";

interface NavbarProps {
  rounds: Round[];
}

export default function Navbar({ rounds }: NavbarProps) {
  const { publicKey, disconnect, connected, connect } = useWallet();
  const { user, logout } = useAuth();
  const balance = useSolBalance(connected ? publicKey : null);
  const [avatar, setAvatar] = useState("");
  const [username, setUsername] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    if (!publicKey) { setAvatar(""); setUsername(""); return; }
    setAvatar(localStorage.getItem(`avatar_${publicKey}`) ?? "");
    setUsername(localStorage.getItem(`username_${publicKey}`) ?? "");
  }, [publicKey]);

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
  const shortKey = publicKey ? `${publicKey.slice(0, 4)}...${publicKey.slice(-4)}` : null;
  const doraFormatted = user ? Math.floor(user.doraBalance).toLocaleString("en-US") : "0";

  return (
    <>
    <WinToastBanner />
    <nav className="fixed top-0 left-0 right-0 z-50 h-14 bg-surface border-b border-surface-3 flex items-center px-4 gap-3">

      {/* Logo */}
      <Link href="/" className="flex items-center shrink-0 mr-1">
        <Image src="/logo.png" alt="Pumpdora" width={180} height={52} style={{ objectFit: "contain" }} />
      </Link>

      {/* Live indicator */}
      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-3 text-xs text-muted shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] pulse-dot" />
        LIVE
      </div>

      {/* Total pool */}
      <div className="hidden lg:flex items-center gap-1 text-xs text-muted shrink-0">
        <span>Pool:</span>
        <span className="text-brand font-mono font-semibold">{totalPool.toFixed(1)} SOL</span>
      </div>

      {/* Nav links */}
      <div className="hidden sm:flex items-center gap-4 ml-2">
        <Link href="/leaderboard" className="text-xs text-muted hover:text-white transition-colors">
          🏆 Leaderboard
        </Link>
        <Link href="/faq" className="text-xs text-muted hover:text-white transition-colors">
          FAQ
        </Link>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right side */}
      <div className="flex items-center gap-2">

        {/* Network badge */}
        <span className="hidden md:inline-flex px-2 py-0.5 rounded text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 shrink-0">
          devnet
        </span>

        {/* Theme toggle */}
        <ThemeToggle />

        {/* ── DORA user logged in: show balance + username + logout only ── */}
        {user ? (
          <>
            <span className="hidden sm:block w-px h-5 bg-surface-3 shrink-0" />
            <div className="hidden sm:flex items-center gap-2">
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand/10 border border-brand/20 text-brand text-xs font-mono font-semibold whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0" />
                {doraFormatted} DORA
              </span>
              <span className="text-xs text-muted font-medium max-w-[80px] truncate">{user.username}</span>
            </div>
            <button
              onClick={logout}
              className="px-2.5 py-1 rounded-md text-xs text-muted hover:text-white border border-surface-3 hover:border-surface-2 transition-colors shrink-0"
            >
              Logout
            </button>
          </>
        ) : (
          /* ── Not logged in via DORA: show login + wallet section ── */
          <>
            <button
              onClick={() => setShowAuthModal(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-brand/40 text-brand hover:bg-brand/10 transition-colors shrink-0"
            >
              Login / Register
            </button>

            <span className="hidden sm:block w-px h-5 bg-surface-3 shrink-0" />

            {/* Wallet section */}
            {connected && publicKey ? (
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full overflow-hidden border border-surface-3 shrink-0">
                  {avatar ? (
                    <img src={avatar} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-brand/20 flex items-center justify-center text-brand font-bold text-[10px] select-none">
                      {publicKey.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="hidden md:flex items-center gap-1.5 text-xs font-mono">
                  <span className={username ? "text-white font-semibold" : "text-muted"}>
                    {username || shortKey}
                  </span>
                  {balance !== null && (
                    <>
                      <span className="text-surface-3">·</span>
                      <span className="text-muted">{balance.toFixed(2)} SOL</span>
                    </>
                  )}
                </div>
                <Link
                  href="/profile"
                  className="px-2.5 py-1 rounded-md text-xs bg-surface-3 text-muted hover:text-white border border-surface-3 hover:border-surface-2 transition-colors shrink-0"
                >
                  Profile
                </Link>
                <button
                  onClick={() => disconnect()}
                  className="px-2.5 py-1 rounded-md text-xs text-muted hover:text-white border border-surface-3 hover:border-surface-2 transition-colors shrink-0"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={connect}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-brand hover:bg-brand-dim text-black transition-colors shrink-0"
              >
                Connect Wallet
              </button>
            )}
          </>
        )}
      </div>
    </nav>

    {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </>
  );
}
