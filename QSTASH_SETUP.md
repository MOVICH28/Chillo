# QStash Cron Setup

Chillo uses [Upstash QStash](https://upstash.com/docs/qstash/overall/getstarted) to trigger round resolution every 10 minutes.

## 1. Get your QStash signing keys

1. Go to [console.upstash.com](https://console.upstash.com) → **QStash**
2. Copy your **QSTASH_CURRENT_SIGNING_KEY** and **QSTASH_NEXT_SIGNING_KEY**

## 2. Add env vars to Vercel

```bash
vercel env add QSTASH_CURRENT_SIGNING_KEY
vercel env add QSTASH_NEXT_SIGNING_KEY
```

Or add them in the Vercel dashboard under **Settings → Environment Variables**.

## 3. Create the schedule in QStash

In the QStash console, create a new schedule:

| Field    | Value                                           |
|----------|-------------------------------------------------|
| URL      | `https://chillo-f11o.vercel.app/api/cron/resolve` |
| Schedule | `*/10 * * * *` (every 10 minutes)              |
| Method   | `GET`                                           |
| Header   | `Authorization: Bearer YOUR_CRON_SECRET`        |

QStash will automatically add its `upstash-signature` header — the route accepts **either** the Bearer token or the QStash signature, so both work.

## 4. Manual trigger (testing)

```bash
curl -X GET https://chillo-f11o.vercel.app/api/cron/resolve \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

## How auth works

The route accepts two auth methods:

1. **`Authorization: Bearer CRON_SECRET`** — for manual testing and non-QStash triggers
2. **QStash signature** (`upstash-signature` header) — verified against `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY`

The server returns `500` if neither `CRON_SECRET` nor the QStash keys are set, and `401` if the request doesn't pass either check.
