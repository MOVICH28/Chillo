import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const now = new Date();

  const rounds = [
    {
      question: "Will pump.fun total token volume exceed $200M today?",
      category: "pumpfun",
      endsAt: new Date(now.getTime() + 4 * 60 * 60 * 1000),
      yesPool: 137.9,
      noPool: 91.9,
      totalPool: 229.8,
    },
    {
      question: "Will any pump.fun token reach $1M market cap within 24h?",
      category: "pumpfun",
      endsAt: new Date(now.getTime() + 8 * 60 * 60 * 1000),
      yesPool: 320.0,
      noPool: 180.0,
      totalPool: 500,
    },
    {
      question: "Will BTC exceed $70,000 within the next 24 hours?",
      category: "crypto",
      endsAt: new Date(now.getTime() + 12 * 60 * 60 * 1000),
      yesPool: 95.0,
      noPool: 80.0,
      totalPool: 175,
    },
    {
      question: "Will Solana exceed $85 within the next 24 hours?",
      category: "crypto",
      endsAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      yesPool: 180.0,
      noPool: 120.0,
      totalPool: 300,
    },
  ];

  const created = await prisma.round.createMany({ data: rounds });

  return NextResponse.json({ created: created.count });
}
