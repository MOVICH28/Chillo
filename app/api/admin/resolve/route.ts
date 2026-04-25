import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveRound } from "@/lib/resolve";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { roundId, winningOutcome, adminPassword } = body;

  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || adminPassword !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!roundId || !winningOutcome) {
    return NextResponse.json({ error: "roundId and winningOutcome required" }, { status: 400 });
  }

  const round = await prisma.round.findUnique({ where: { id: roundId } });
  if (!round) return NextResponse.json({ error: "Round not found" }, { status: 404 });
  if (round.status === "resolved") {
    return NextResponse.json({ error: "Round already resolved" }, { status: 409 });
  }

  try {
    const result = await resolveRound(roundId, winningOutcome);
    console.log(`[admin/resolve] roundId=${roundId} outcome=${winningOutcome}`);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[admin/resolve] error:`, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
