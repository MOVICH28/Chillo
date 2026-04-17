"use client";

import { useEffect, useRef } from "react";

interface BetWithRound {
  id: string;
  roundId: string;
  side: string;
  amount: number;
  payout: number | null;
  result: string | null;
  round: { question: string; status: string } | null;
}

const LS_KEY = "pumpdora_seen_wins";

function getSeenWins(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function markWinSeen(betId: string) {
  try {
    const seen = getSeenWins();
    seen.add(betId);
    localStorage.setItem(LS_KEY, JSON.stringify(Array.from(seen)));
  } catch {}
}

function fireNotification(bet: BetWithRound) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  const question = bet.round?.question?.slice(0, 50) ?? bet.roundId;
  new Notification("🎉 You won!", {
    body: `You won ${bet.payout?.toFixed(4) ?? "?"} SOL on "${question}"`,
    icon: "/favicon.ico",
  });
}

export type WinToast = {
  id: string;
  message: string;
};

export function useWinNotifications(
  walletAddress: string | null,
  onWin?: (toast: WinToast) => void,
) {
  const prevBets = useRef<Map<string, string | null>>(new Map());
  const permissionRequested = useRef(false);

  useEffect(() => {
    if (!walletAddress) return;

    // Request permission once
    if (!permissionRequested.current && typeof window !== "undefined" && "Notification" in window) {
      permissionRequested.current = true;
      Notification.requestPermission().catch(() => {});
    }

    async function check() {
      if (!walletAddress) return;
      try {
        const res = await fetch(`/api/bets?wallet=${walletAddress}`, { cache: "no-store" });
        if (!res.ok) return;
        const bets: BetWithRound[] = await res.json();
        if (!Array.isArray(bets)) return;

        const seenWins = getSeenWins();

        for (const bet of bets) {
          const prev = prevBets.current.get(bet.id);
          const isWin = bet.result !== null && bet.result === bet.side;

          // Detect transition: was null/unknown, now a win
          const justResolved = prev === undefined || prev === null;
          if (isWin && justResolved && !seenWins.has(bet.id)) {
            markWinSeen(bet.id);
            fireNotification(bet);
            if (onWin) {
              const question = bet.round?.question?.slice(0, 50) ?? bet.roundId;
              onWin({
                id: bet.id,
                message: `🎉 You won ${bet.payout?.toFixed(4) ?? "?"} SOL on "${question}"!`,
              });
            }
          }

          prevBets.current.set(bet.id, bet.result);
        }
      } catch {}
    }

    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [walletAddress, onWin]);
}
