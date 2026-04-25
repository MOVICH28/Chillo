import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  const hours  = parseInt(req.nextUrl.searchParams.get("hours") ?? "24", 10);
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const bearerToken = process.env.TWITTER_BEARER_TOKEN;
  if (!bearerToken) return NextResponse.json({ error: "Twitter API not configured" }, { status: 500 });

  const startTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  try {
    const res = await fetch(
      `https://api.twitter.com/2/users/${userId}/tweets?max_results=100&start_time=${startTime}&tweet.fields=created_at&exclude=retweets,replies`,
      { headers: { Authorization: `Bearer ${bearerToken}` }, cache: "no-store" }
    );

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg = (body as { title?: string }).title ?? `Twitter API error (${res.status})`;
      console.error(`[twitter-posts] userId=${userId} → HTTP ${res.status}:`, msg);
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const data = await res.json();
    const tweets: { id: string; created_at?: string }[] = data.data ?? [];

    console.log(`[twitter-posts] userId=${userId} hours=${hours} → ${tweets.length} posts`);
    return NextResponse.json({
      postCount:    tweets.length,
      lastPostTime: tweets[0]?.created_at ?? null,
      lastPostUrl:  tweets[0]?.id ? `https://x.com/i/web/status/${tweets[0].id}` : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Fetch failed";
    console.error(`[twitter-posts] userId=${userId} fetch error:`, msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
