import { NextResponse } from "next/server";
import { ROUNDS_DATA } from "@/lib/rounds-data";

export async function GET() {
  return NextResponse.json(ROUNDS_DATA);
}
