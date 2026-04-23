import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const normalised = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalised } });

    // Always return success to prevent email enumeration
    if (!user) {
      return NextResponse.json({ message: "If that email exists, a reset code was sent." });
    }

    // Invalidate any existing unused codes for this email
    await prisma.passwordReset.updateMany({
      where: { email: normalised, used: false },
      data: { used: true },
    });

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await prisma.passwordReset.create({
      data: { email: normalised, code, expiresAt },
    });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: `"Pumpdora" <${process.env.GMAIL_USER}>`,
      to: user.email,
      subject: "Your Pumpdora password reset code",
      html: `
        <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:24px;background:#0f0f1a;border-radius:12px;color:#fff;">
          <h2 style="color:#22c55e;margin-bottom:8px;">Password Reset</h2>
          <p style="color:#9ca3af;margin-bottom:24px;">Use the code below to reset your Pumpdora password. It expires in 15 minutes.</p>
          <div style="background:#1a1a2e;border:1px solid #374151;border-radius:8px;padding:20px;text-align:center;margin-bottom:24px;">
            <span style="font-family:monospace;font-size:36px;font-weight:bold;letter-spacing:8px;color:#22c55e;">${code}</span>
          </div>
          <p style="color:#6b7280;font-size:12px;">If you did not request this, ignore this email. Your account is safe.</p>
        </div>
      `,
    });

    console.log(`[forgot-password] Reset code sent to ${normalised}`);
    return NextResponse.json({ message: "If that email exists, a reset code was sent." });
  } catch (err) {
    console.error("[forgot-password] error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Failed to send reset email" }, { status: 500 });
  }
}
