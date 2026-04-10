import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveRound } from "@/lib/resolve";
import { ROUNDS_DATA } from "@/lib/rounds-data";

// ─── Price fetching ──────────────────────────────────────────────────────────

interface CoinGeckoPrices {
  bitcoin?: { usd: number };
  solana?: { usd: number };
}

async function fetchCryptoPrices(): Promise<CoinGeckoPrices> {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,solana&vs_currencies=usd",
    { next: { revalidate: 0 } }
  );
  if (!res.ok) throw new Error(`CoinGecko error: ${res.status}`);
  return res.json();
}

// Fetch top pump.fun tokens via DexScreener and return the highest market cap seen
async function fetchPumpFunTopMcap(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://api.dexscreener.com/latest/dex/tokens/pump?rankBy=marketCap&order=desc&limit=10",
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    const pairs: { fdv?: number; marketCap?: number }[] = data?.pairs ?? [];
    if (pairs.length === 0) return null;
    return Math.max(...pairs.map((p) => p.marketCap ?? p.fdv ?? 0));
  } catch {
    return null;
  }
}

// Fetch 24h volume for pump.fun tokens via DexScreener
async function fetchPumpFunVolume24h(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://api.dexscreener.com/latest/dex/tokens/pump?rankBy=volume&order=desc&limit=50",
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    const pairs: { volume?: { h24?: number } }[] = data?.pairs ?? [];
    if (pairs.length === 0) return null;
    return pairs.reduce((sum, p) => sum + (p.volume?.h24 ?? 0), 0);
  } catch {
    return null;
  }
}

// ─── Price parsing ───────────────────────────────────────────────────────────

/** Extract a USD price target like "$70,000" or "$85" from a question string. */
function parseUsdTarget(question: string): number | null {
  const match = question.match(/\$([0-9][0-9,]*)/);
  if (!match) return null;
  return parseFloat(match[1].replace(/,/g, ""));
}

// ─── Winner determination ────────────────────────────────────────────────────

async function determineWinner(
  roundId: string,
  question: string,
  category: string
): Promise<"yes" | "no" | null> {
  if (category === "crypto") {
    const prices = await fetchCryptoPrices();

    if (/BTC|Bitcoin/i.test(question)) {
      const target = parseUsdTarget(question);
      const current = prices.bitcoin?.usd;
      if (!target || !current) return null;
      console.log(`[cron] BTC price: $${current}, target: $${target}`);
      return current >= target ? "yes" : "no";
    }

    if (/Solana|SOL/i.test(question)) {
      const target = parseUsdTarget(question);
      const current = prices.solana?.usd;
      if (!target || !current) return null;
      console.log(`[cron] SOL price: $${current}, target: $${target}`);
      return current >= target ? "yes" : "no";
    }
  }

  if (category === "pumpfun") {
    if (/volume.*\$200M|\$200M.*volume/i.test(question)) {
      const volume = await fetchPumpFunVolume24h();
      if (volume === null) {
        console.warn(`[cron] ${roundId}: pump.fun 24h volume unavailable`);
        return null;
      }
      console.log(`[cron] pump.fun 24h volume: $${volume.toLocaleString()}`);
      return volume >= 200_000_000 ? "yes" : "no";
    }

    if (/\$1M.*market cap|market cap.*\$1M/i.test(question)) {
      const topMcap = await fetchPumpFunTopMcap();
      if (topMcap === null) {
        console.warn(`[cron] ${roundId}: pump.fun market cap data unavailable`);
        return null;
      }
      console.log(`[cron] pump.fun top market cap: $${topMcap.toLocaleString()}`);
      return topMcap >= 1_000_000 ? "yes" : "no";
    }
  }

  console.warn(`[cron] ${roundId}: no resolution rule matched for "${question}"`);
  return null;
}

// ─── Check if already resolved ───────────────────────────────────────────────

async function isAlreadyResolved(roundId: string): Promise<boolean> {
  const unpaid = await prisma.bet.count({ where: { roundId, paid: false } });
  const total = await prisma.bet.count({ where: { roundId } });
  // Resolved if there are bets and none are unpaid
  return total > 0 && unpaid === 0;
}

// ─── Cron handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Vercel sends Authorization: Bearer <CRON_SECRET> when CRON_SECRET is set
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  const summary: {
    roundId: string;
    status: "resolved" | "skipped" | "already_resolved" | "no_data" | "error";
    winner?: string;
    detail?: string;
  }[] = [];

  for (const round of ROUNDS_DATA) {
    const endsAt = new Date(round.endsAt);

    if (endsAt > now) {
      summary.push({ roundId: round.id, status: "skipped", detail: "not ended yet" });
      continue;
    }

    if (await isAlreadyResolved(round.id)) {
      summary.push({ roundId: round.id, status: "already_resolved" });
      continue;
    }

    let winner: "yes" | "no" | null;
    try {
      winner = await determineWinner(round.id, round.question, round.category);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[cron] ${round.id} determineWinner error:`, msg);
      summary.push({ roundId: round.id, status: "error", detail: msg });
      continue;
    }

    if (winner === null) {
      summary.push({ roundId: round.id, status: "no_data", detail: "could not fetch external data" });
      continue;
    }

    try {
      await resolveRound(round.id, winner);
      summary.push({ roundId: round.id, status: "resolved", winner });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[cron] ${round.id} resolveRound error:`, msg);
      summary.push({ roundId: round.id, status: "error", detail: msg });
    }
  }

  return NextResponse.json({ ran_at: now.toISOString(), rounds: summary });
}
