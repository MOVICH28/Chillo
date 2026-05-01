import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";
const CREATION_FEE = 10;
const ADMIN_USERNAME = "pumpdora";

function getPayload(req: NextRequest): { userId: string } | null {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try { return jwt.verify(auth.slice(7), JWT_SECRET) as { userId: string }; }
  catch { return null; }
}

export async function POST(req: NextRequest) {
  console.log("[markets/create] POST request received");
  const payload = getPayload(req);
  if (!payload) {
    console.warn("[markets/create] Unauthorized — missing or invalid token");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    tokenAddress, question, outcomes, duration, description, twitterUrl, customImage,
    // Twitter market fields
    twitterUsername, twitterUserId, twitterQuestion, twitterPeriodHours,
    // Optional logo override (e.g. unavatar.io URL for Twitter markets)
    tokenLogo: tokenLogoOverride,
    // Crypto question type: "price" | "ath_mcap" | "mcap"
    questionType,
    // Separate betting duration (minutes) — when present, endsAt = now + betDuration + 5min
    betDuration,
    // pump.fun token flag (auto-detected or manually set)
    isPumpFun,
    // Token battle: [{address, symbol, name, logoUrl, currentMcap, outcomeId}]
    tokenBattleTokens,
  } = body;

  const isTwitterMarket = !!twitterUsername;

  if (!question?.trim())
    return NextResponse.json({ error: "Question is required" }, { status: 400 });
  if (question.length > 150)
    return NextResponse.json({ error: "Question too long (max 150 chars)" }, { status: 400 });
  if (!Array.isArray(outcomes) || outcomes.length < 2 || outcomes.length > 6)
    return NextResponse.json({ error: "2–6 outcomes required" }, { status: 400 });
  for (const o of outcomes) {
    if (!o.label?.trim())
      return NextResponse.json({ error: `Outcome ${o.id} label is required` }, { status: 400 });
  }

  // Duration validation — accept betDuration or legacy duration
  const bettingMinutes = Number(betDuration ?? duration);
  if (!bettingMinutes || bettingMinutes < 1 || bettingMinutes > 10080)
    return NextResponse.json({ error: "Duration must be 1 min–7 days" }, { status: 400 });

  if (isTwitterMarket) {
    if (!["posts_count", "next_post_time"].includes(twitterQuestion))
      return NextResponse.json({ error: "Invalid twitterQuestion type" }, { status: 400 });
  }

  if (questionType === "coin_battle") {
    if (!Array.isArray(tokenBattleTokens) || tokenBattleTokens.length < 2)
      return NextResponse.json({ error: "Token battle requires at least 2 tokens" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (user.doraBalance < CREATION_FEE)
    return NextResponse.json({ error: `Insufficient DORA (need ${CREATION_FEE})` }, { status: 400 });

  // Rate limit: 20/day for admin, 2/day for everyone else
  const dailyLimit = user.username === ADMIN_USERNAME ? 20 : 2;
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const marketsCreatedToday = await prisma.round.count({
    where: { creatorId: user.id, createdAt: { gte: oneDayAgo } },
  });
  if (marketsCreatedToday >= dailyLimit)
    return NextResponse.json({ error: `Daily limit reached. You can create ${dailyLimit} markets per day.` }, { status: 429 });

  // If tokenAddress given, look up token info
  let tokenSymbol: string | null = null;
  let tokenLogo: string | null = tokenLogoOverride ?? null;
  if (tokenAddress) {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL ?? "https://chillo-f11o.vercel.app"}/api/markets/token-lookup?address=${encodeURIComponent(tokenAddress)}`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const info = await res.json();
        tokenSymbol = info.symbol ?? null;
        if (!tokenLogo) tokenLogo = info.logoUrl ?? null;
      }
    } catch { /* proceed without token metadata */ }
  }

  const now = new Date();
  // Short rounds (≤3 min): 2-min result buffer. Longer rounds: 5-min buffer.
  const resultBufferMs = bettingMinutes <= 3 ? 2 * 60_000 : 5 * 60_000;
  let endsAt: Date;
  let bettingClosesAt: Date;
  if (betDuration) {
    bettingClosesAt = new Date(now.getTime() + bettingMinutes * 60_000);
    endsAt          = new Date(bettingClosesAt.getTime() + resultBufferMs);
  } else {
    endsAt          = new Date(now.getTime() + bettingMinutes * 60_000);
    bettingClosesAt = new Date(endsAt.getTime() - resultBufferMs);
  }

  // Initialise LMSR shares to 0 for each outcome
  const sharesInit = Object.fromEntries(outcomes.map((o: { id: string }) => [o.id, 0]));

  const totalRounds = await prisma.round.count();

  const [, round] = await prisma.$transaction([
    prisma.user.update({
      where: { id: payload.userId },
      data: {
        doraBalance: { decrement: CREATION_FEE },
        lastMarketCreatedAt: now,
      },
    }),
    prisma.round.create({
      data: {
        roundNumber:       totalRounds + 1,
        question:          question.trim(),
        category:          isTwitterMarket ? "twitter" : "custom",
        status:            "open",
        endsAt,
        bettingClosesAt,
        outcomes:          outcomes.map((o: { id: string; label: string; minPrice?: number | null; maxPrice?: number | null }) => ({
          id: o.id,
          label: o.label.trim(),
          minPrice: o.minPrice ?? null,
          maxPrice: o.maxPrice ?? null,
          pool: 0,
        })),
        shares:            sharesInit,
        lmsrB:             100,
        isCustom:          true,
        creatorId:         payload.userId,
        creatorFee:        0.01,
        description:       description?.trim()    || null,
        twitterUrl:        twitterUrl?.trim()     || null,
        customImage:       customImage            || null,
        tokenAddress:      tokenAddress           || null,
        tokenSymbol,
        tokenLogo,
        twitterUsername:    twitterUsername?.replace(/^@/, "").trim() || null,
        twitterUserId:      twitterUserId          || null,
        twitterQuestion:    twitterQuestion        || null,
        twitterPeriodHours: twitterPeriodHours     || null,
        questionType:       questionType           || null,
        isPumpFun:          Boolean(isPumpFun),
        tokenBattleTokens:  tokenBattleTokens      || null,
      },
    }),
  ]);

  console.log(`[markets/create] user=${payload.userId} round=${round.id} category=${round.category} questionType=${round.questionType ?? "none"} q="${round.question.slice(0, 60)}"`);
  return NextResponse.json({ id: round.id, question: round.question }, { status: 201 });
}
