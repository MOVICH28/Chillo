import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET ?wallet=ADDRESS — returns referral stats for the referrer
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet param required" }, { status: 400 });

  try {
    const referrals = await prisma.referral.findMany({
      where: { referrerAddress: wallet },
    });

    const referredAddresses = referrals.map((r) => r.referredAddress);

    // Sum all bets placed by referred users
    const bets = referredAddresses.length > 0
      ? await prisma.bet.findMany({
          where: { walletAddress: { in: referredAddresses } },
          select: { amount: true },
        })
      : [];

    const totalBetVolume = bets.reduce((s, b) => s + b.amount, 0);
    const totalEarned = parseFloat((totalBetVolume * 0.01).toFixed(4)); // 1% of bets

    return NextResponse.json({
      referralCount: referrals.length,
      totalEarned,
      referrals: referrals.map((r) => ({
        referredAddress: r.referredAddress,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[GET /api/referral]", error);
    return NextResponse.json({ error: "Failed to fetch referral stats" }, { status: 500 });
  }
}

// POST — register a referral { referrerAddress, referredAddress }
export async function POST(req: NextRequest) {
  try {
    const { referrerAddress, referredAddress } = await req.json();

    if (!referrerAddress || !referredAddress) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (referrerAddress === referredAddress) {
      return NextResponse.json({ error: "Cannot refer yourself" }, { status: 400 });
    }

    // Upsert — ignore if already referred by someone
    const existing = await prisma.referral.findUnique({
      where: { referredAddress },
    });
    if (existing) {
      return NextResponse.json({ already: true });
    }

    const referral = await prisma.referral.create({
      data: { referrerAddress, referredAddress },
    });

    return NextResponse.json({ ...referral, createdAt: referral.createdAt.toISOString() }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/referral]", error);
    return NextResponse.json({ error: "Failed to register referral" }, { status: 500 });
  }
}
