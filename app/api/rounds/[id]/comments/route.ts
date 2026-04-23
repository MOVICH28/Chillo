import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import jwt from "jsonwebtoken";

export const dynamic = "force-dynamic";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";

function getUserId(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as { userId: string };
    return payload.userId;
  } catch {
    return null;
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const comments = await prisma.comment.findMany({
    where: { roundId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { user: { select: { username: true } } },
  });
  return NextResponse.json(comments.map(c => ({
    id: c.id,
    text: c.text,
    createdAt: c.createdAt.toISOString(),
    username: c.user.username,
    userId: c.userId,
  })));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { text } = await req.json();
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ error: "Comment cannot be empty" }, { status: 400 });
  }
  if (text.trim().length > 500) {
    return NextResponse.json({ error: "Comment too long (max 500 chars)" }, { status: 400 });
  }

  const comment = await prisma.comment.create({
    data: { roundId: id, userId, text: text.trim() },
    include: { user: { select: { username: true } } },
  });

  return NextResponse.json({
    id: comment.id,
    text: comment.text,
    createdAt: comment.createdAt.toISOString(),
    username: comment.user.username,
    userId: comment.userId,
  });
}
