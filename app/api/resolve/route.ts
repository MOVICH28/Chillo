import { NextRequest, NextResponse } from "next/server";
import { resolveRound } from "@/lib/resolve";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Require CRON_SECRET authorization
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let roundId: string;
  let winner: string;

  try {
    const body = await req.json();
    roundId = body.roundId;
    winner = body.winner;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!roundId || !winner) {
    return NextResponse.json({ error: "roundId and winner are required" }, { status: 400 });
  }
  if (winner !== "yes" && winner !== "no") {
    return NextResponse.json({ error: "winner must be 'yes' or 'no'" }, { status: 400 });
  }
  // Sanitize: only allow cuid-shaped IDs
  if (!/^[a-z0-9]{20,30}$/.test(roundId)) {
    return NextResponse.json({ error: "Invalid roundId" }, { status: 400 });
  }

  const round = await prisma.round.findUnique({ where: { id: roundId } });
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  try {
    const result = await resolveRound(roundId, winner as "yes" | "no");
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[POST /api/resolve] error");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
