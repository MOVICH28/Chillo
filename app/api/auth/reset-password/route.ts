import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { email, code, newPassword } = await req.json();

    if (!email || !code || !newPassword) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    const normalised = email.trim().toLowerCase();

    const reset = await prisma.passwordReset.findFirst({
      where: {
        email: normalised,
        code: code.trim(),
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!reset) {
      return NextResponse.json({ error: "Invalid or expired reset code" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { email: normalised },
        data: { passwordHash },
      }),
      prisma.passwordReset.update({
        where: { id: reset.id },
        data: { used: true },
      }),
    ]);

    console.log(`[reset-password] Password reset for ${normalised}`);
    return NextResponse.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("[reset-password] error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
  }
}
