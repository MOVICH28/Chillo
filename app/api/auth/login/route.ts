import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";

export async function POST(req: NextRequest) {
  try {
    const { identifier, password } = await req.json();

    if (!identifier || !password) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const normalised = identifier.trim().toLowerCase();

    // Find by email or username
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: normalised },
          { username: normalised },
        ],
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Invalid email/username or password" }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid email/username or password" }, { status: 401 });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });

    return NextResponse.json({
      token,
      user: { id: user.id, username: user.username, email: user.email, doraBalance: user.doraBalance },
    });
  } catch {
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
