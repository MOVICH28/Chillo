import { NextResponse } from "next/server";
import { ROUNDS_DATA } from "@/lib/rounds-data";

function seedResponse() {
  return NextResponse.json({ seeded: ROUNDS_DATA.length, rounds: ROUNDS_DATA });
}

export async function GET() {
  return seedResponse();
}

export async function POST() {
  return seedResponse();
}
