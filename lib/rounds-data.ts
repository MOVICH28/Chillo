import { Round } from "@/lib/types";

function computeOdds(yesPool: number, noPool: number, totalPool: number) {
  if (totalPool === 0 || yesPool === 0 || noPool === 0) {
    return { yesOdds: 2.0, noOdds: 2.0, yesPct: 50, noPct: 50 };
  }
  const yesOdds = parseFloat(Math.max(1.05, totalPool / yesPool).toFixed(2));
  const noOdds = parseFloat(Math.max(1.05, totalPool / noPool).toFixed(2));
  const yesPct = parseFloat(((yesPool / totalPool) * 100).toFixed(1));
  const noPct = parseFloat(((noPool / totalPool) * 100).toFixed(1));
  return { yesOdds, noOdds, yesPct, noPct };
}

const rawRounds = [
  {
    id: "round-1",
    question: "Will pump.fun total token volume exceed $200M today?",
    category: "pumpfun",
    status: "open" as const,
    yesPool: 137.9,
    noPool: 91.9,
    totalPool: 229.8,
    endsAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    bets: [],
  },
  {
    id: "round-2",
    question: "Will any pump.fun token reach $1M market cap within 24h?",
    category: "pumpfun",
    status: "open" as const,
    yesPool: 320.0,
    noPool: 180.0,
    totalPool: 500.0,
    endsAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    bets: [],
  },
  {
    id: "round-3",
    question: "Will BTC exceed $70,000 within the next 24 hours?",
    category: "crypto",
    status: "open" as const,
    yesPool: 95.0,
    noPool: 80.0,
    totalPool: 175.0,
    endsAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    bets: [],
  },
  {
    id: "round-4",
    question: "Will Solana exceed $85 within the next 24 hours?",
    category: "crypto",
    status: "open" as const,
    yesPool: 180.0,
    noPool: 120.0,
    totalPool: 300.0,
    endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    bets: [],
  },
];

export const ROUNDS_DATA: Round[] = rawRounds.map((r) => ({
  ...r,
  ...computeOdds(r.yesPool, r.noPool, r.totalPool),
}));
