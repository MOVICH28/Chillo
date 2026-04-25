import { NextRequest, NextResponse } from "next/server";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { prisma } from "@/lib/prisma";
import { Outcome } from "@/lib/types";

export const dynamic = "force-dynamic";
import { resolveRound } from "@/lib/resolve";
import { createDailyRounds } from "@/lib/create-rounds";

// ─── Price fetching ───────────────────────────────────────────────────────────

interface CoinGeckoPrices {
  bitcoin?: { usd: number };
  solana?:  { usd: number };
}

async function fetchCryptoPrices(): Promise<CoinGeckoPrices> {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,solana&vs_currencies=usd",
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error(`CoinGecko error: ${res.status}`);
  return res.json();
}

async function fetchPumpFunTopMcap(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://api.dexscreener.com/latest/dex/tokens/pump?rankBy=marketCap&order=desc&limit=10",
      { cache: "no-store" }
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

// ─── Winner determination ─────────────────────────────────────────────────────

type RoundRow = {
  id: string;
  question: string;
  category: string;
  targetPrice: number | null;
  targetToken: string | null;
  tokenList: string | null;
  outcomes: unknown; // Prisma.JsonValue | null
};

/** For range rounds: find which outcome bracket the current price falls into. */
function determineRangeOutcome(round: RoundRow, prices: CoinGeckoPrices): string | null {
  const current =
    round.targetToken === "bitcoin" ? prices.bitcoin?.usd :
    round.targetToken === "solana"  ? prices.solana?.usd  : undefined;
  if (!current) return null;

  const outcomes = round.outcomes as Outcome[];
  for (const o of outcomes) {
    const aboveMin = o.minPrice === null || current >= o.minPrice;
    const belowMax = o.maxPrice === null || current <  o.maxPrice;
    if (aboveMin && belowMax) return o.id;
  }
  // Fallback: last outcome if nothing matched (price exactly at upper boundary)
  return outcomes[outcomes.length - 1]?.id ?? null;
}

/** For yes/no rounds: return "yes" | "no" | null */
async function determineYesNoWinner(
  round: RoundRow,
  prices: CoinGeckoPrices,
): Promise<"yes" | "no" | null> {
  if (round.category === "crypto" && round.targetToken && round.targetPrice) {
    const current =
      round.targetToken === "bitcoin"
        ? prices.bitcoin?.usd
        : prices.solana?.usd;
    if (!current) return null;
    console.log(`[cron] ${round.id}: resolving yes/no crypto round`);
    return current >= round.targetPrice ? "yes" : "no";
  }

  if (round.category === "pumpfun") {
    const topMcap = await fetchPumpFunTopMcap();
    if (topMcap === null) {
      console.warn(`[cron] ${round.id}: pump.fun mcap data unavailable`);
      return null;
    }
    console.log(`[cron] pump.fun mcap data fetched`);
    return topMcap >= 1_000_000 ? "yes" : "no";
  }

  console.warn(`[cron] ${round.id}: no resolution rule matched for "${round.question}"`);
  return null;
}

// ─── Twitter resolution ───────────────────────────────────────────────────────

// Fixed outcome ranges for posts_count questions
function postsCountOutcome(count: number): string {
  if (count <= 2)  return "A";
  if (count <= 5)  return "B";
  if (count <= 10) return "C";
  if (count <= 20) return "D";
  if (count <= 50) return "E";
  return "F";
}

// Fixed outcome ranges for next_post_time questions (hours from round start)
function nextPostTimeOutcome(hoursElapsed: number | null): string {
  if (hoursElapsed === null) return "F"; // no post found
  if (hoursElapsed < 1)  return "A";
  if (hoursElapsed < 3)  return "B";
  if (hoursElapsed < 6)  return "C";
  if (hoursElapsed < 12) return "D";
  if (hoursElapsed < 24) return "E";
  return "F";
}

async function resolveTwitterRounds(
  rounds: { id: string; twitterUserId: string | null; twitterQuestion: string | null; createdAt: Date; endsAt: Date }[],
): Promise<{ roundId: string; status: "resolved" | "skipped" | "no_data" | "error"; winner?: string; detail?: string }[]> {
  const bearerToken = process.env.TWITTER_BEARER_TOKEN;
  if (!bearerToken) {
    console.warn("[cron/twitter] TWITTER_BEARER_TOKEN not set — skipping Twitter rounds");
    return rounds.map(r => ({ roundId: r.id, status: "skipped" as const, detail: "no bearer token" }));
  }

  // Group rounds by twitterUserId to batch API calls
  const byUser = new Map<string, typeof rounds>();
  for (const r of rounds) {
    if (!r.twitterUserId) continue;
    const list = byUser.get(r.twitterUserId) ?? [];
    list.push(r);
    byUser.set(r.twitterUserId, list);
  }

  const summary: { roundId: string; status: "resolved" | "skipped" | "no_data" | "error"; winner?: string; detail?: string }[] = [];

  for (const [userId, userRounds] of Array.from(byUser.entries())) {
    // Find the widest time window needed across all rounds for this user
    const minStart = userRounds.reduce((min, r) => r.createdAt < min ? r.createdAt : min, userRounds[0].createdAt);

    try {
      const startTime = minStart.toISOString();
      const res = await fetch(
        `https://api.twitter.com/2/users/${userId}/tweets?max_results=100&start_time=${startTime}&tweet.fields=created_at&exclude=retweets,replies`,
        { headers: { Authorization: `Bearer ${bearerToken}` }, cache: "no-store" }
      );

      if (!res.ok) {
        console.error(`[cron/twitter] userId=${userId} → HTTP ${res.status}`);
        for (const r of userRounds) summary.push({ roundId: r.id, status: "no_data", detail: `Twitter API ${res.status}` });
        continue;
      }

      const data = await res.json();
      const tweets: { id: string; created_at: string }[] = data.data ?? [];
      console.log(`[cron/twitter] userId=${userId} → ${tweets.length} tweets since ${startTime}`);

      for (const round of userRounds) {
        const roundStart = round.createdAt;
        const roundEnd   = round.endsAt;
        // Only count tweets within this round's window
        const roundTweets = tweets.filter(t => {
          const ts = new Date(t.created_at);
          return ts >= roundStart && ts <= roundEnd;
        });

        let winner: string;
        if (round.twitterQuestion === "posts_count") {
          winner = postsCountOutcome(roundTweets.length);
        } else if (round.twitterQuestion === "next_post_time") {
          const first = roundTweets.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];
          if (first) {
            const hoursElapsed = (new Date(first.created_at).getTime() - roundStart.getTime()) / 3_600_000;
            winner = nextPostTimeOutcome(hoursElapsed);
          } else {
            winner = nextPostTimeOutcome(null);
          }
        } else {
          summary.push({ roundId: round.id, status: "skipped", detail: "unknown twitterQuestion type" });
          continue;
        }

        try {
          await resolveRound(round.id, winner);
          summary.push({ roundId: round.id, status: "resolved", winner });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          summary.push({ roundId: round.id, status: "error", detail: msg });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[cron/twitter] userId=${userId} fetch error:`, msg);
      for (const r of userRounds) summary.push({ roundId: r.id, status: "error", detail: msg });
    }
  }

  return summary;
}

// ─── Cron handler ─────────────────────────────────────────────────────────────

async function runCron(): Promise<NextResponse> {
  const now = new Date();

  // ── Step 1: resolve ended open rounds ─────────────────────────────────────
  const endedRounds = await prisma.round.findMany({
    where: { status: "open", endsAt: { lte: now } },
  });

  // Split by resolution type
  const twitterRounds = endedRounds.filter(r => r.category === "twitter");
  const cryptoRounds  = endedRounds.filter(r => r.category !== "twitter");

  // Fetch crypto prices once — reused for all crypto rounds
  let cryptoPrices: CoinGeckoPrices = {};
  const needsCrypto = cryptoRounds.some(r => r.category === "crypto");
  if (needsCrypto) {
    try {
      cryptoPrices = await fetchCryptoPrices();
    } catch (err) {
      console.warn("[cron] Failed to fetch crypto prices:", err instanceof Error ? err.message : err);
    }
  }

  const summary: {
    roundId: string;
    status: "resolved" | "skipped" | "no_data" | "error";
    winner?: string;
    detail?: string;
  }[] = [];

  // ── Resolve Twitter rounds (batched by user) ───────────────────────────────
  if (twitterRounds.length > 0) {
    const twitterSummary = await resolveTwitterRounds(twitterRounds);
    summary.push(...twitterSummary);
  }

  for (const round of cryptoRounds) {
    let winner: string | null;

    try {
      if (round.outcomes !== null) {
        winner = determineRangeOutcome(round, cryptoPrices);
        if (winner === null) {
          console.warn(`[cron] ${round.id}: could not determine range outcome (price data missing)`);
          summary.push({ roundId: round.id, status: "no_data", detail: "crypto price unavailable" });
          continue;
        }
      } else {
        winner = await determineYesNoWinner(round, cryptoPrices);
        if (winner === null) {
          summary.push({ roundId: round.id, status: "no_data", detail: "could not fetch external data" });
          continue;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[cron] ${round.id} winner determination error:`, msg);
      summary.push({ roundId: round.id, status: "error", detail: msg });
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

  // ── Step 2: create new rounds for any category that no longer has an active round ──
  // This runs AFTER resolution so newly-resolved rounds immediately spawn successors.
  const createResult = await createDailyRounds();
  console.log(`[cron] rounds_created=${createResult.created.join(",") || "none"} skipped=${createResult.skipped.join(",") || "none"} errors=${createResult.errors.join(",") || "none"}`);

  return NextResponse.json({
    ran_at:          now.toISOString(),
    rounds_resolved: summary,
    rounds_created:  createResult,
  });
}

// Exported GET — Bearer token short-circuits for manual testing;
// all other requests go through QStash signature verification.
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") === `Bearer ${cronSecret}`) {
    return runCron();
  }

  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey    = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentSigningKey || !nextSigningKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const qstashHandler = verifySignatureAppRouter(
    () => runCron(),
    { currentSigningKey, nextSigningKey },
  );
  return qstashHandler(req);
}
