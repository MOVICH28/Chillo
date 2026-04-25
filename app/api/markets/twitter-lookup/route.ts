import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get("username");
  if (!username) return NextResponse.json({ error: "username required" }, { status: 400 });

  const bearerToken = process.env.TWITTER_BEARER_TOKEN;
  if (!bearerToken) return NextResponse.json({ error: "Twitter API not configured" }, { status: 500 });

  const clean = username.replace(/^@/, "").trim();
  if (!clean) return NextResponse.json({ error: "Invalid username" }, { status: 400 });

  try {
    const res = await fetch(
      `https://api.twitter.com/2/users/by/username/${encodeURIComponent(clean)}?user.fields=public_metrics,profile_image_url`,
      { headers: { Authorization: `Bearer ${bearerToken}` }, cache: "no-store" }
    );

    if (res.status === 404) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg = (body as { title?: string }).title ?? `Twitter API error (${res.status})`;
      console.error(`[twitter-lookup] @${clean} → HTTP ${res.status}:`, msg);
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const data = await res.json();
    const user = data.data;
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    console.log(`[twitter-lookup] @${clean} → id=${user.id} followers=${user.public_metrics?.followers_count}`);
    return NextResponse.json({
      id:              user.id,
      name:            user.name,
      username:        user.username,
      profileImageUrl: user.profile_image_url?.replace("_normal", "_bigger") ?? null,
      followersCount:  user.public_metrics?.followers_count ?? 0,
      tweetsCount:     user.public_metrics?.tweet_count ?? 0,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lookup failed";
    console.error(`[twitter-lookup] @${clean} fetch error:`, msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
