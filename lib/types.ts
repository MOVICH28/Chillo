export type RoundStatus = "open" | "closed" | "resolved";
export type BetSide = "yes" | "no";

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
  // Computed by API
  yesOdds?: number;
  noOdds?: number;
  yesPct?: number;
  noPct?: number;
  realPool?: number; // totalPool minus 20 SOL base seed — actual user bets only
  bets?: Bet[];
}

export interface Bet {
  id: string;
  roundId: string;
  walletAddress: string;
  side: BetSide;
  amount: number;
  odds: number;
  txHash: string;
  createdAt: string;
}
