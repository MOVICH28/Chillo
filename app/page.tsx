"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import LiveTicker from "@/components/LiveTicker";
import Sidebar from "@/components/Sidebar";
import RoundCard from "@/components/RoundCard";
import RightPanel from "@/components/RightPanel";
import BetModal from "@/components/BetModal";
import { Round } from "@/lib/types";
import { useLiveData } from "@/lib/useLiveData";
import { useWallet } from "@/components/WalletProvider";

export default function Home() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("all");
  const [betTarget, setBetTarget] = useState<{ round: Round; side: "yes" | "no" } | null>(null);
  const { data: liveData } = useLiveData();
  const { publicKey, connected } = useWallet();
  const searchParams = useSearchParams();

  // Save ref code to localStorage when visiting via referral link
  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) {
      localStorage.setItem("chillo_ref", ref);
    }
  }, [searchParams]);

  // Register referral once wallet connects, if we have a stored ref code
  useEffect(() => {
    if (!connected || !publicKey) return;
    const ref = localStorage.getItem("chillo_ref");
    if (!ref || ref === publicKey) return;

    // Fire-and-forget — expand ref short code back to full address if needed
    // ref may be a short wallet prefix; if it matches nothing the API rejects gracefully
    fetch("/api/referral", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referrerAddress: ref, referredAddress: publicKey }),
    }).then(() => {
      localStorage.removeItem("chillo_ref");
    }).catch(() => {});
  }, [connected, publicKey]);

  const fetchRounds = useCallback(async () => {
    try {
      const res = await fetch("/api/rounds");
      if (!res.ok) throw new Error("Failed");
      const data: Round[] = await res.json();
      setRounds(data);
    } catch {
      console.error("Could not load rounds");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRounds();
    const id = setInterval(fetchRounds, 15000);
    return () => clearInterval(id);
  }, [fetchRounds]);

  const filtered =
    category === "all" ? rounds : rounds.filter((r) => r.category === category);

  const counts = rounds.reduce<Record<string, number>>((acc, r) => {
    acc[r.category] = (acc[r.category] ?? 0) + 1;
    acc["all"] = (acc["all"] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-base flex flex-col">
      <Navbar rounds={rounds} />

      {/* Ticker just below navbar */}
      <div className="mt-14">
        <LiveTicker liveData={liveData} />
      </div>

      {/* Main layout */}
      <div className="flex flex-1 max-w-[1400px] mx-auto w-full px-4 py-6 gap-6">
        {/* Sidebar */}
        <div className="hidden lg:block">
          <Sidebar active={category} onSelect={setCategory} counts={counts} />
        </div>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          {/* Page header */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-white font-bold text-xl">
                {category === "all" ? "All Markets" : category === "pumpfun" ? "pump.fun Markets" : "Crypto Markets"}
              </h1>
              <p className="text-muted text-xs mt-0.5">
                {filtered.length} active market{filtered.length !== 1 ? "s" : ""}
              </p>
            </div>

            {/* Mobile category pills */}
            <div className="flex gap-2 lg:hidden">
              {["all", "pumpfun", "crypto"].map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors
                    ${category === c ? "bg-brand text-black" : "bg-surface-3 text-muted"}`}
                >
                  {c === "pumpfun" ? "🚀" : c === "crypto" ? "₿" : "All"}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-surface rounded-xl border border-surface-3 h-64 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <p className="text-4xl mb-3">🎯</p>
              <p className="text-white font-semibold">No markets yet</p>
              <p className="text-muted text-sm mt-1">Check back soon for new prediction rounds.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filtered.map((round) => (
                <RoundCard
                  key={round.id}
                  round={round}
                  onBet={(r, side) => setBetTarget({ round: r, side })}
                  liveData={liveData}
                />
              ))}
            </div>
          )}

          {/* Referral banner */}
          <div className="mt-8 rounded-xl border border-brand/20 bg-brand/5 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="text-white font-semibold text-sm">Earn with referrals</p>
              <p className="text-muted text-xs mt-1 max-w-md">
                Share your link. Earn <span className="text-brand font-semibold">1% of every bet</span> your referrals place — paid automatically in SOL.
              </p>
            </div>
            <a
              href="/profile#referral"
              className="shrink-0 px-4 py-2 rounded-lg text-sm font-semibold bg-brand hover:bg-brand-dim text-black transition-colors"
            >
              Get your link →
            </a>
          </div>
        </main>

        {/* Right panel */}
        <div className="hidden xl:block">
          <RightPanel rounds={rounds} />
        </div>
      </div>

      {/* Bet modal */}
      {betTarget && (
        <BetModal
          round={betTarget.round}
          side={betTarget.side}
          onClose={() => setBetTarget(null)}
          onSuccess={fetchRounds}
          solPrice={liveData.sol?.price}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-surface-3 py-4 px-6 flex items-center justify-between text-[11px] text-muted">
        <span>Chillo © 2025 · Solana devnet</span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse-slow" />
          All markets are simulated on devnet
        </span>
      </footer>
    </div>
  );
}
