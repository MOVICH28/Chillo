import { NextResponse } from "next/server";
import { createDailyRounds } from "@/lib/create-rounds";

export const dynamic = "force-dynamic";

export async function POST() {
  const result = await createDailyRounds();
  return NextResponse.json(result, { status: 201 });
}
