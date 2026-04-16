export type RoundStatus = "open" | "closed" | "resolved";
export type BetSide = "yes" | "no";

export interface Outcome {
  id: string;           // "A" | "B" | "C" | "D"
  label: string;
  minPrice: number | null;
  maxPrice: number | null;
  pool: number;
}

export interface Round {
  id: string;
  question: string;
  category: string;
  yesPool: number;
  noPool: number;
  totalPool: number;
  status: RoundStatus;
  endsAt: string;
  createdAt: string;
  // Dynamic round fields
  targetPrice?: number | null;
  targetToken?: string | null;
  tokenList?: string | null;
  resolvedAt?: string | null;
  winner?: string | null;
  // Range betting fields
  outcomes?: Outcome[] | null;
  bettingClosesAt?: string | null;
  winningOutcome?: string | null;
  // Computed by API
  yesOdds?: number;
  noOdds?: number;
  yesPct?: number;
  noPct?: number;
  realPool?: number; // totalPool minus base seed (yes/no rounds) or totalPool (range rounds)
  roundNumber?: number | null;
  bets?: Bet[];
}

export interface Bet {
  id: string;
  roundId: string;
  walletAddress: string;
  side: string; // "yes" | "no" | "A" | "B" | "C" | "D"
  amount: number;
  odds: number;
  txHash: string;
  createdAt: string;
}
