"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";
import RoundCard from "@/components/RoundCard";
import RangeCard from "@/components/RangeCard";
import RightPanel from "@/components/RightPanel";
import BetModal from "@/components/BetModal";
import TwitterMarketCard from "@/components/TwitterMarketCard";
import { Round, Outcome } from "@/lib/types";
import { useLiveData } from "@/lib/useLiveData";

// Isolated component so useSearchParams has its own Suspense boundary
function RefCapture() {
  const searchParams = useSearchParams();
  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) localStorage.setItem("pumpdora_ref", ref);
  }, [searchParams]);
  return null;
}

export default function Home() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("all");
  const [betTarget, setBetTarget] = useState<{ round: Round; side: string; outcome?: Outcome } | null>(null);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [sort, setSort] = useState<"new" | "volume">("new");
  const { data: liveData } = useLiveData();

  const fetchRounds = useCallback(async () => {
    try {
      const res = await fetch("/api/rounds", { cache: "no-store" });
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
    const id = setInterval(fetchRounds, 10000);
    return () => clearInterval(id);
  }, [fetchRounds]);

  const allOpenRounds  = rounds
    .filter((r) => r.status !== "resolved")
    .sort((a, b) =>
      sort === "volume"
        ? (b.totalVolume ?? 0) - (a.totalVolume ?? 0)
        : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  const resolvedRounds = rounds
    .filter((r) => r.status === "resolved")
    .sort((a, b) => new Date(b.resolvedAt ?? b.createdAt).getTime() - new Date(a.resolvedAt ?? a.createdAt).getTime())
    .slice(0, 20);

  const isCryptoRound = (r: Round) =>
    !r.twitterUsername &&
    (r.category === "crypto" || r.category === "custom" || r.isPumpFun || r.category === "pumpfun" ||
      !!r.targetToken || !!r.tokenAddress || !!r.tokenSymbol);

  const filtered =
    category === "all"         ? allOpenRounds :
    category === "twitter"     ? allOpenRounds.filter((r) => r.twitterUsername) :
    category === "pumpfun"     ? allOpenRounds.filter((r) => r.isPumpFun || r.category === "pumpfun") :
    category === "coin_battle" ? allOpenRounds.filter((r) => (r as any).questionType === "coin_battle") :
    category === "crypto"      ? allOpenRounds.filter(isCryptoRound) :
    allOpenRounds.filter((r) => r.category === category);

  const counts = allOpenRounds.reduce<Record<string, number>>((acc, r) => {
    acc["all"] = (acc["all"] ?? 0) + 1;
    if (r.twitterUsername) acc["twitter"] = (acc["twitter"] ?? 0) + 1;
    if (r.isPumpFun || r.category === "pumpfun") acc["pumpfun"] = (acc["pumpfun"] ?? 0) + 1;
    if (isCryptoRound(r)) acc["crypto"] = (acc["crypto"] ?? 0) + 1;
    if ((r as any).questionType === "coin_battle") acc["coin_battle"] = (acc["coin_battle"] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-base flex flex-col">
      <Suspense fallback={null}><RefCapture /></Suspense>
      <Navbar rounds={rounds} />

      {/* Main layout */}
      <div className="flex flex-row gap-3 max-w-[1400px] mx-auto w-full px-2 h-[calc(100vh-56px)] mt-14 overflow-x-hidden">
        {/* Sidebar */}
        <div id="categories" className="hidden lg:block w-40 shrink-0 overflow-y-auto py-6 no-scrollbar">
          <Sidebar active={category} onSelect={setCategory} counts={counts} />
        </div>

        {/* Main content */}
        <main id="markets" className="flex-1 min-w-0 overflow-y-auto py-6 no-scrollbar">
          {/* Page header */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-white font-bold text-xl">
                {category === "all" ? "All Markets" : category === "pumpfun" ? "pump.fun Markets" : category === "twitter" ? "Twitter / X Markets" : category === "coin_battle" ? "⚔️ Coin Battle" : "Crypto Markets"}
              </h1>
              <p className="text-muted text-xs mt-0.5">
                {filtered.length} market{filtered.length !== 1 ? "s" : ""}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* Sort buttons (desktop) */}
              <div className="hidden lg:flex items-center gap-0.5 bg-surface-3/40 rounded-lg p-0.5">
                {(["new", "volume"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSort(s)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors
                      ${sort === s ? "bg-surface text-white" : "text-muted hover:text-white/70"}`}
                  >
                    {s === "new" ? "New" : "Volume"}
                  </button>
                ))}
              </div>

              {/* Mobile category pills */}
              <div className="flex gap-2 lg:hidden">
                {["all", "pumpfun", "crypto", "twitter"].map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors
                      ${category === c ? "bg-brand text-black" : "bg-surface-3 text-muted"}`}
                  >
                    {c === "pumpfun" ? "🚀" : c === "crypto" ? "₿" : c === "twitter" ? "𝕏" : "All"}
                  </button>
                ))}
              </div>
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
              {filtered.map((round) =>
                round.twitterUsername ? (
                  <TwitterMarketCard key={round.id} round={round} />
                ) : round.outcomes ? (
                  <RangeCard
                    key={round.id}
                    round={round}
                    onBet={(r, outcomeId, outcome) => setBetTarget({ round: r, side: outcomeId, outcome })}
                    liveData={liveData}
                  />
                ) : (
                  <RoundCard
                    key={round.id}
                    round={round}
                    onBet={(r, side) => setBetTarget({ round: r, side })}
                    liveData={liveData}
                  />
                )
              )}
            </div>
          )}

          {/* Completed rounds */}
          {resolvedRounds.length > 0 && (
            <div id="stats" className="mt-8">
              <button
                onClick={() => setCompletedOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-surface border border-surface-3 hover:border-surface-2 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-surface-3" />
                  <span className="text-white font-semibold text-sm">Completed Rounds</span>
                  <span className="text-[10px] uppercase tracking-widest text-muted">
                    {resolvedRounds.length} recent
                  </span>
                </div>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className={`w-4 h-4 text-muted transition-transform duration-200 ${completedOpen ? "rotate-180" : ""}`}
                  viewBox="0 0 20 20" fill="currentColor"
                >
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>

              {completedOpen && (
                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {resolvedRounds.map((round) =>
                    round.outcomes ? (
                      <RangeCard
                        key={round.id}
                        round={round}
                        onBet={() => {}}
                        liveData={liveData}
                      />
                    ) : (
                      <RoundCard
                        key={round.id}
                        round={round}
                        onBet={() => {}}
                        liveData={liveData}
                      />
                    )
                  )}
                </div>
              )}
            </div>
          )}

          {/* Referral banner */}
          <div className="mt-8 rounded-xl border border-brand/20 bg-brand/5 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="text-white font-semibold text-sm">Earn with referrals</p>
              <p className="text-muted text-xs mt-1 max-w-md">
                Share your link. Earn <span className="text-brand font-semibold">1% of every bet</span> your referrals place — paid automatically in DORA.
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
        <div className="hidden xl:block w-56 shrink-0 overflow-y-auto overflow-hidden py-6 no-scrollbar">
          <RightPanel rounds={rounds} />
        </div>
      </div>

      {/* Bet modal */}
      {betTarget && (
        <BetModal
          round={betTarget.round}
          side={betTarget.side}
          outcome={betTarget.outcome}
          onClose={() => setBetTarget(null)}
          onSuccess={fetchRounds}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-surface-3 py-4 px-6 flex items-center justify-between text-[11px] text-muted">
        <span>Pumpdora © 2025 · Solana devnet</span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse-slow" />
          All markets are simulated on devnet
        </span>
      </footer>
    </div>
  );
}
