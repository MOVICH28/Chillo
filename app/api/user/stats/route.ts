import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/user/stats?userId=xxx  — followers/following counts for own profile
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const [followersCount, followingCount, createdMarketsCount, referredCount] = await Promise.all([
    prisma.follow.count({ where: { followingId: userId } }),
    prisma.follow.count({ where: { followerId: userId } }),
    prisma.round.count({ where: { creatorId: userId } }),
    prisma.user.count({ where: { referredBy: userId } }),
  ]);

  return NextResponse.json({ followersCount, followingCount, createdMarketsCount, referredCount });
}
