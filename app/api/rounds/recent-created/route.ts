import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rounds = await prisma.round.findMany({
      where: {
        OR: [
          { isCustom: true },
          { creatorId: { not: null } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id:        true,
        question:  true,
        creatorId: true,
        createdAt: true,
        creator: {
          select: {
            username:  true,
            avatarUrl: true,
          },
        },
      },
    });
    return NextResponse.json(rounds);
  } catch {
    return NextResponse.json([]);
  }
}
