import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";
const CREATION_FEE = 10;
const MAX_MARKETS_PER_DAY = 2;

function getPayload(req: NextRequest): { userId: string } | null {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try { return jwt.verify(auth.slice(7), JWT_SECRET) as { userId: string }; }
  catch { return null; }
}

export async function POST(req: NextRequest) {
  const payload = getPayload(req);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { tokenAddress, question, outcomes, duration, description, twitterUrl, customImage } = body;

  if (!question?.trim())
    return NextResponse.json({ error: "Question is required" }, { status: 400 });
  if (question.length > 100)
    return NextResponse.json({ error: "Question too long (max 100 chars)" }, { status: 400 });
  if (!Array.isArray(outcomes) || outcomes.length < 2 || outcomes.length > 6)
    return NextResponse.json({ error: "2–6 outcomes required" }, { status: 400 });
  for (const o of outcomes) {
    if (!o.label?.trim())
      return NextResponse.json({ error: `Outcome ${o.id} label is required` }, { status: 400 });
  }
  const durationMinutes = Number(duration);
  if (!durationMinutes || durationMinutes < 15 || durationMinutes > 10080)
    return NextResponse.json({ error: "Duration must be 15 min–7 days" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (user.doraBalance < CREATION_FEE)
    return NextResponse.json({ error: `Insufficient DORA (need ${CREATION_FEE})` }, { status: 400 });

  // Rate limit: max 2 markets per 24h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentCount = await prisma.round.count({
    where: { creatorId: payload.userId, createdAt: { gte: since } },
  });
  if (recentCount >= MAX_MARKETS_PER_DAY)
    return NextResponse.json({ error: "Max 2 markets per 24 hours" }, { status: 429 });

  // If tokenAddress given, look up token info
  let tokenSymbol: string | null = null;
  let tokenLogo: string | null = null;
  if (tokenAddress) {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL ?? "https://chillo-f11o.vercel.app"}/api/markets/token-lookup?address=${encodeURIComponent(tokenAddress)}`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const info = await res.json();
        tokenSymbol = info.symbol ?? null;
        tokenLogo   = info.logoUrl ?? null;
      }
    } catch { /* proceed without token metadata */ }
  }

  const now = new Date();
  const endsAt = new Date(now.getTime() + durationMinutes * 60 * 1000);
  const bettingClosesAt = new Date(endsAt.getTime() - 5 * 60 * 1000);

  // Initialise LMSR shares to 0 for each outcome
  const sharesInit = Object.fromEntries(outcomes.map((o: { id: string }) => [o.id, 0]));

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
        question:       question.trim(),
        category:       "custom",
        status:         "open",
        endsAt,
        bettingClosesAt,
        outcomes:       outcomes.map((o: { id: string; label: string }) => ({
          id: o.id, label: o.label.trim(), minPrice: null, maxPrice: null, pool: 0,
        })),
        shares:         sharesInit,
        lmsrB:          100,
        isCustom:       true,
        creatorId:      payload.userId,
        creatorFee:     0.01,
        description:    description?.trim() || null,
        twitterUrl:     twitterUrl?.trim()  || null,
        customImage:    customImage?.trim() || null,
        tokenAddress:   tokenAddress        || null,
        tokenSymbol,
        tokenLogo,
      },
    }),
  ]);

  return NextResponse.json({ id: round.id, question: round.question }, { status: 201 });
}
