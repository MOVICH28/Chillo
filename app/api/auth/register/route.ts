import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";

export async function POST(req: NextRequest) {
  try {
    const { username, email, password, refCode } = await req.json();

    if (!username || !email || !password) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (typeof username !== "string" || username.length < 2 || username.length > 30) {
      return NextResponse.json({ error: "Username must be 2–30 characters" }, { status: 400 });
    }
    if (typeof password !== "string" || password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    let referredById: string | null = null;
    if (refCode && typeof refCode === "string") {
      const referrer = await prisma.user.findUnique({ where: { username: refCode.trim() }, select: { id: true } });
      if (referrer) referredById = referrer.id;
    }

    const trimmedUsername = username.trim();
    const user = await prisma.user.create({
      data: {
        username: trimmedUsername,
        email: email.toLowerCase().trim(),
        passwordHash,
        referralCode: trimmedUsername,
        ...(referredById ? { referredBy: referredById } : {}),
      },
    });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });

    return NextResponse.json(
      { token, user: { id: user.id, username: user.username, email: user.email, doraBalance: user.doraBalance } },
      { status: 201 },
    );
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "Username or email already taken" }, { status: 409 });
    }
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
