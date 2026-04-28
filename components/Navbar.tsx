"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/useAuth";
import { Round } from "@/lib/types";
import WinToastBanner from "@/components/WinToastBanner";
import ThemeToggle from "@/components/ThemeToggle";
import AuthModal from "@/components/AuthModal";

interface NavbarProps {
  rounds: Round[];
}

export default function Navbar({ rounds }: NavbarProps) {
  const { user, logout } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [volume24h, setVolume24h] = useState(0);

  useEffect(() => {
    setIsAdmin(!!localStorage.getItem("pumpdora_admin_session"));
  }, []);

  useEffect(() => {
    fetch("/api/volume")
      .then(r => r.json())
      .then(d => { if (typeof d.volume24h === "number") setVolume24h(d.volume24h); })
      .catch(() => {});
    const id = setInterval(() => {
      fetch("/api/volume")
        .then(r => r.json())
        .then(d => { if (typeof d.volume24h === "number") setVolume24h(d.volume24h); })
        .catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  // rounds prop kept for compatibility but volume comes from API
  void rounds;
  const doraFormatted = user ? Math.floor(user.doraBalance).toLocaleString("en-US") : "0";
  const volFormatted = volume24h >= 1_000_000
    ? `${(volume24h / 1_000_000).toFixed(2)}M`
    : volume24h >= 1_000
    ? `${(volume24h / 1_000).toFixed(1)}K`
    : volume24h.toFixed(0);

  return (
    <>
    <WinToastBanner />
    <nav className="fixed top-0 left-0 right-0 z-50 h-14 bg-surface border-b border-surface-3 flex items-center px-4 gap-3">

      {/* Logo */}
      <Link href="/" className="flex items-center shrink-0 mr-1">
        <Image src="/logo.png" alt="Pumpdora" width={180} height={52} style={{ objectFit: "contain" }} />
      </Link>

      {/* Volume 24h */}
      <div className="hidden lg:flex items-center gap-1 text-xs text-muted shrink-0">
        <span>Volume 24h:</span>
        <span className="text-brand font-mono font-semibold">{volFormatted} DORA</span>
      </div>

      {/* Nav links */}
      <div className="hidden sm:flex items-center gap-4 ml-2">
        <Link href="/leaderboard" className="text-xs text-muted hover:text-white transition-colors">
          🏆 Leaderboard
        </Link>
        <Link href="/portfolio" className="text-xs text-muted hover:text-white transition-colors">
          Portfolio
        </Link>
        <Link href="/faq" className="text-xs text-muted hover:text-white transition-colors">
          FAQ
        </Link>
        {isAdmin && (
          <Link href="/admin" className="text-xs text-purple-400 hover:text-purple-300 transition-colors">
            Admin
          </Link>
        )}
        {user && (
          <Link href="/create" className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-brand/10 border border-brand/30 text-brand hover:bg-brand/20 transition-colors">
            + Create
          </Link>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right side */}
      <div className="flex items-center gap-2">

        {/* Theme toggle */}
        <ThemeToggle />

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
            <Link
              href="/profile"
              className="px-2.5 py-1 rounded-md text-xs bg-surface-3 text-muted hover:text-white border border-surface-3 hover:border-surface-2 transition-colors shrink-0"
            >
              Profile
            </Link>
            <button
              onClick={logout}
              className="px-2.5 py-1 rounded-md text-xs text-muted hover:text-white border border-surface-3 hover:border-surface-2 transition-colors shrink-0"
            >
              Logout
            </button>
          </>
        ) : (
          <button
            onClick={() => setShowAuthModal(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-brand/40 text-brand hover:bg-brand/10 transition-colors shrink-0"
          >
            Login / Register
          </button>
        )}
      </div>
    </nav>

    {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </>
  );
}
