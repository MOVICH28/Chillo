import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

export const dynamic = "force-dynamic";

export interface NotifyPayload {
  roundId: string;
  username: string;
  questionType: "posts_count" | "next_post_time";
  minutesRemaining: number;
  outcomes: { id: string; label: string }[];
  urgent?: boolean;
}

function buildEmailHtml(p: NotifyPayload): string {
  const outcomesHtml = p.outcomes
    .map(o => `<tr><td style="padding:4px 8px;color:#888;font-size:12px;">${o.id}</td><td style="padding:4px 8px;color:#ddd;font-size:12px;">${o.label}</td></tr>`)
    .join("");

  const urgentBanner = p.urgent
    ? `<div style="background:#ef4444;color:#fff;padding:10px 16px;border-radius:6px;font-weight:bold;margin-bottom:12px;">🚨 URGENT: Round has already expired — manual resolution needed</div>`
    : "";

  return `
<div style="font-family:monospace;background:#0d0f14;color:#e5e7eb;padding:24px;border-radius:12px;max-width:560px;">
  ${urgentBanner}
  <h2 style="color:#38bdf8;margin:0 0 16px;">⏰ Twitter Round ${p.urgent ? "EXPIRED" : "Closing Soon"}</h2>

  <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
    <tr><td style="color:#888;padding:4px 0;font-size:13px;">Account</td>
        <td style="color:#fff;padding:4px 0;font-size:13px;font-weight:bold;">@${p.username}</td></tr>
    <tr><td style="color:#888;padding:4px 0;font-size:13px;">Question</td>
        <td style="color:#fff;padding:4px 0;font-size:13px;">${p.questionType === "posts_count" ? "Posts Count" : "Next Post Time"}</td></tr>
    <tr><td style="color:#888;padding:4px 0;font-size:13px;">Closes in</td>
        <td style="color:${p.urgent ? "#ef4444" : "#facc15"};padding:4px 0;font-size:13px;font-weight:bold;">${p.urgent ? "EXPIRED" : `${p.minutesRemaining} minutes`}</td></tr>
  </table>

  <div style="margin-bottom:12px;">
    <p style="color:#888;font-size:12px;margin:0 0 6px;">Outcomes:</p>
    <table style="background:#1a1d24;border-radius:6px;width:100%;">${outcomesHtml}</table>
  </div>

  <div style="display:flex;gap:12px;margin-top:16px;">
    <a href="https://twitter.com/${p.username}" style="display:inline-block;padding:8px 16px;background:#1d9bf0;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;">View @${p.username}</a>
    <a href="https://chillo-f11o.vercel.app/admin" style="display:inline-block;padding:8px 16px;background:#7c3aed;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;">Open Admin Panel</a>
  </div>

  <p style="color:#555;font-size:11px;margin-top:16px;">Round ID: ${p.roundId}</p>
</div>`;
}

export async function POST(req: NextRequest) {
  const body: NotifyPayload = await req.json();

  const adminEmail = process.env.ADMIN_EMAIL;
  const gmailUser  = process.env.GMAIL_USER  ?? process.env.ADMIN_EMAIL;
  const gmailPass  = process.env.GMAIL_APP_PASSWORD;

  if (!adminEmail || !gmailUser || !gmailPass) {
    console.warn("[admin/notify] Email not configured — skipping notification");
    return NextResponse.json({ ok: false, reason: "email not configured" });
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailPass },
  });

  const subject = body.urgent
    ? `🚨 EXPIRED Twitter round needs resolution — @${body.username}`
    : `⏰ Twitter round closing in ${body.minutesRemaining}m — @${body.username}`;

  try {
    await transporter.sendMail({
      from: `"Pumpdora Admin" <${gmailUser}>`,
      to:   adminEmail,
      subject,
      html: buildEmailHtml(body),
    });
    console.log(`[admin/notify] Email sent for round ${body.roundId} (@${body.username})`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin/notify] sendMail error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
