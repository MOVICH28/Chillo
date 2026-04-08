import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const now = new Date();
const h = (hours: number) => new Date(now.getTime() + hours * 60 * 60 * 1000);

async function main() {
  await prisma.bet.deleteMany();
  await prisma.round.deleteMany();

  const rounds = await prisma.round.createMany({
    data: [
      {
        question: "Will pump.fun total token volume exceed $200M today?",
        category: "pumpfun",
        yesPool: 142.5,
        noPool: 87.3,
        totalPool: 229.8,
        status: "open",
        endsAt: h(4),
      },
      {
        question: "Will any pump.fun token reach $1M market cap within 24h?",
        category: "pumpfun",
        yesPool: 310.0,
        noPool: 190.0,
        totalPool: 500.0,
        status: "open",
        endsAt: h(8),
      },
      {
        question: "Will BTC exceed $70,000 within the next 24 hours?",
        category: "crypto",
        yesPool: 55.0,
        noPool: 120.0,
        totalPool: 175.0,
        status: "open",
        endsAt: h(12),
      },
      {
        question: "Will Solana exceed $85 within the next 24 hours?",
        category: "crypto",
        yesPool: 200.0,
        noPool: 100.0,
        totalPool: 300.0,
        status: "open",
        endsAt: h(24),
      },
    ],
  });

  console.log(`✅ Seeded ${rounds.count} rounds`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
