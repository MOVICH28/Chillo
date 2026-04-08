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
  // Computed by API
  yesOdds?: number;
  noOdds?: number;
  yesPct?: number;
  noPct?: number;
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
