import { NextRequest, NextResponse } from "next/server";
import { resolveRound } from "@/lib/resolve";
import { ROUNDS_DATA } from "@/lib/rounds-data";

export async function POST(req: NextRequest) {
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

  const round = ROUNDS_DATA.find((r) => r.id === roundId);
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  try {
    const result = await resolveRound(roundId, winner as "yes" | "no");
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/resolve]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
