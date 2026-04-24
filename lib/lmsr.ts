export const PLATFORM_FEE = 0.01; // 1%

// C(q) = b * log(Σ exp(qᵢ/b))
export function lmsrCost(q: number[], b: number): number {
  return Math.round(b * Math.log(q.reduce((sum, qi) => sum + Math.exp(qi / b), 0)) * 1_000_000) / 1_000_000;
}

// Cost to buy `sharesToBuy` shares of `outcome` given current market state.
// Pass activeOutcomes = only the outcome IDs defined for this round.
// Negative sharesToBuy = selling → returns negative (proceeds received).
export function costToBuy(
  currentShares: Record<string, number>,
  outcome: string,
  sharesToBuy: number,
  b: number,
  activeOutcomes: string[] = ["A", "B", "C", "D", "E", "F"]
): number {
  const qBefore = activeOutcomes.map(o => currentShares[o] ?? 0);
  const qAfter  = activeOutcomes.map(o =>
    o === outcome ? (currentShares[o] ?? 0) + sharesToBuy : (currentShares[o] ?? 0)
  );
  return Math.round((lmsrCost(qAfter, b) - lmsrCost(qBefore, b)) * 1_000_000) / 1_000_000;
}

// Instantaneous price (probability) of one outcome.
export function getPrice(
  currentShares: Record<string, number>,
  outcome: string,
  b: number,
  activeOutcomes: string[] = ["A", "B", "C", "D", "E", "F"]
): number {
  const idx = activeOutcomes.indexOf(outcome);
  if (idx === -1) return 0;
  const q      = activeOutcomes.map(o => currentShares[o] ?? 0);
  const sumExp = q.reduce((s, qi) => s + Math.exp(qi / b), 0);
  return Math.round(Math.exp(q[idx] / b) / sumExp * 1_000_000) / 1_000_000;
}

// Prices for all active outcomes (sums to 1).
export function getAllPrices(
  currentShares: Record<string, number>,
  b: number,
  activeOutcomes: string[] = ["A", "B", "C", "D", "E", "F"]
): Record<string, number> {
  const q      = activeOutcomes.map(o => currentShares[o] ?? 0);
  const sumExp = q.reduce((s, qi) => s + Math.exp(qi / b), 0);
  const prices: Record<string, number> = {};
  activeOutcomes.forEach((o, i) => {
    prices[o] = Math.round(Math.exp(q[i] / b) / sumExp * 1_000_000) / 1_000_000;
  });
  return prices;
}
