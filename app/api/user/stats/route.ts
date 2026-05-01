import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId   = req.nextUrl.searchParams.get("userId");
  const username = req.nextUrl.searchParams.get("username");

  try {
    // Resolve user
    let user: { id: string; username: string; avatarUrl: string | null; createdAt: Date } | null = null;
    if (userId) {
      user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true, avatarUrl: true, createdAt: true } });
    } else if (username) {
      user = await prisma.user.findUnique({ where: { username }, select: { id: true, username: true, avatarUrl: true, createdAt: true } });
    }

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const [followersCount, followingCount, createdMarketsCount, referredCount, tradeAgg, positionsCount] = await Promise.all([
      prisma.follow.count({ where: { followingId: user.id } }),
      prisma.follow.count({ where: { followerId: user.id } }),
      prisma.round.count({ where: { creatorId: user.id } }),
      prisma.user.count({ where: { referredBy: user.id } }),
      prisma.trade.aggregate({ where: { userId: user.id, type: "buy" }, _sum: { totalCost: true }, _count: true }),
      prisma.position.count({ where: { userId: user.id, shares: { gt: 0.001 } } }),
    ]);

    return NextResponse.json({
      followersCount,
      followingCount,
      createdMarketsCount,
      referredCount,
      username:       user.username,
      avatarUrl:      user.avatarUrl,
      joinedAt:       user.createdAt.toISOString(),
      volume:         tradeAgg._sum.totalCost ?? 0,
      tradesCount:    tradeAgg._count,
      positionsCount,
    });
  } catch (err) {
    console.error("[user/stats]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
