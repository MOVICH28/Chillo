import { NextRequest, NextResponse } from "next/server";
import { createDailyRounds } from "@/lib/create-rounds";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await createDailyRounds();
  return NextResponse.json(result, { status: 201 });
}
