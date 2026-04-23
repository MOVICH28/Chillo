import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";

function getUserId(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as { userId: string };
    return payload.userId;
  } catch { return null; }
}

// GET /api/user/follow?targetUserId=xxx
export async function GET(req: NextRequest) {
  const targetUserId = req.nextUrl.searchParams.get("targetUserId");
  if (!targetUserId) return NextResponse.json({ error: "Missing targetUserId" }, { status: 400 });

  const viewerId = getUserId(req);

  const [followersCount, followingCount, isFollowing, isMutual] = await Promise.all([
    prisma.follow.count({ where: { followingId: targetUserId } }),
    prisma.follow.count({ where: { followerId: targetUserId } }),
    viewerId
      ? prisma.follow.findUnique({ where: { followerId_followingId: { followerId: viewerId, followingId: targetUserId } } })
      : Promise.resolve(null),
    viewerId
      ? prisma.follow.findUnique({ where: { followerId_followingId: { followerId: targetUserId, followingId: viewerId } } })
      : Promise.resolve(null),
  ]);

  return NextResponse.json({
    followersCount,
    followingCount,
    isFollowing: !!isFollowing,
    isMutual: !!isFollowing && !!isMutual,
  });
}

// POST /api/user/follow  { targetUserId }
export async function POST(req: NextRequest) {
  const followerId = getUserId(req);
  if (!followerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { targetUserId } = await req.json();
  if (!targetUserId || targetUserId === followerId) {
    return NextResponse.json({ error: "Invalid target" }, { status: 400 });
  }

  await prisma.follow.upsert({
    where: { followerId_followingId: { followerId, followingId: targetUserId } },
    create: { followerId, followingId: targetUserId },
    update: {},
  });

  return NextResponse.json({ ok: true });
}

// DELETE /api/user/follow  { targetUserId }
export async function DELETE(req: NextRequest) {
  const followerId = getUserId(req);
  if (!followerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { targetUserId } = await req.json();
  if (!targetUserId) return NextResponse.json({ error: "Invalid target" }, { status: 400 });

  await prisma.follow.deleteMany({
    where: { followerId, followingId: targetUserId },
  });

  return NextResponse.json({ ok: true });
}
