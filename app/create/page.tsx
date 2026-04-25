"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/lib/useAuth";

const OUTCOME_IDS = ["A", "B", "C", "D", "E", "F"];
const DURATIONS = [
  { label: "15 min",   value: 15 },
  { label: "1 hour",   value: 60 },
  { label: "4 hours",  value: 240 },
  { label: "24 hours", value: 1440 },
];

const POSTS_COUNT_OUTCOMES = [
  { id: "A", label: "0–2 posts" },
  { id: "B", label: "3–5 posts" },
  { id: "C", label: "6–10 posts" },
  { id: "D", label: "11–20 posts" },
  { id: "E", label: "21–50 posts" },
  { id: "F", label: "50+ posts" },
];

const NEXT_POST_OUTCOMES = [
  { id: "A", label: "Within 1 hour" },
  { id: "B", label: "1–3 hours" },
  { id: "C", label: "3–6 hours" },
  { id: "D", label: "6–12 hours" },
  { id: "E", label: "12–24 hours" },
  { id: "F", label: "More than 24 hours" },
];

interface TokenInfo {
  name: string;
  symbol: string;
  priceUsd: number;
  priceChange24h: number;
  volume24h: number;
  logoUrl: string | null;
  address: string;
}

interface TwitterInfo {
  id: string;
  name: string;
  username: string;
  profileImageUrl: string | null;
  followersCount: number;
  tweetsCount: number;
}

interface OutcomeInput {
  id: string;
  label: string;
}

export default function CreatePage() {
  const router = useRouter();
  const { user, getToken } = useAuth();

  // ── Category selection (step 0) ───────────────────────────────────────────
  const [category, setCategory] = useState<"crypto" | "twitter" | null>(null);
  const [step, setStep]         = useState(0);

  // ── Crypto: Step 1 — token ────────────────────────────────────────────────
  const [tokenQuery,   setTokenQuery]   = useState("");
  const [tokenInfo,    setTokenInfo]    = useState<TokenInfo | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenError,   setTokenError]   = useState("");

  // ── Twitter: Step 1 — account ─────────────────────────────────────────────
  const [twitterQuery,   setTwitterQuery]   = useState("");
  const [twitterInfo,    setTwitterInfo]    = useState<TwitterInfo | null>(null);
  const [twitterLoading, setTwitterLoading] = useState(false);
  const [twitterError,   setTwitterError]   = useState("");

  // ── Twitter: Step 2 — question type ──────────────────────────────────────
  const [twitterQuestion, setTwitterQuestion] = useState<"posts_count" | "next_post_time">("posts_count");

  // ── Shared: details ───────────────────────────────────────────────────────
  const [question,    setQuestion]    = useState("");
  const [description, setDescription] = useState("");
  const [twitterUrl,  setTwitterUrl]  = useState("");
  const [customImage, setCustomImage] = useState("");
  const [duration,    setDuration]    = useState(1440);

  // ── Shared: outcomes ─────────────────────────────────────────────────────
  const [outcomes, setOutcomes] = useState<OutcomeInput[]>([
    { id: "A", label: "" },
    { id: "B", label: "" },
  ]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const [creating,    setCreating]    = useState(false);
  const [createError, setCreateError] = useState("");

  // ── Step labels per category ──────────────────────────────────────────────
  const stepLabels = category === "twitter"
    ? ["Account", "Question", "Outcomes", "Review"]
    : ["Token",   "Details",  "Outcomes", "Review"];

  // ── Token lookup (crypto) ─────────────────────────────────────────────────
  const lookupToken = useCallback(async (q: string) => {
    if (!q.trim()) { setTokenInfo(null); return; }
    setTokenLoading(true);
    setTokenError("");
    try {
      const res = await fetch(`/api/markets/token-lookup?address=${encodeURIComponent(q.trim())}`);
      if (!res.ok) { setTokenError((await res.json()).error ?? "Token not found"); setTokenInfo(null); }
      else         { setTokenInfo(await res.json()); }
    } catch { setTokenError("Lookup failed"); setTokenInfo(null); }
    finally { setTokenLoading(false); }
  }, []);

  useEffect(() => {
    if (!tokenQuery.trim()) { setTokenInfo(null); setTokenError(""); return; }
    const id = setTimeout(() => lookupToken(tokenQuery), 500);
    return () => clearTimeout(id);
  }, [tokenQuery, lookupToken]);

  // ── Twitter account lookup ────────────────────────────────────────────────
  async function verifyTwitter() {
    if (!twitterQuery.trim()) return;
    setTwitterLoading(true);
    setTwitterError("");
    setTwitterInfo(null);
    try {
      const res = await fetch(`/api/markets/twitter-lookup?username=${encodeURIComponent(twitterQuery.trim())}`);
      if (!res.ok) { setTwitterError((await res.json()).error ?? "User not found"); }
      else         { setTwitterInfo(await res.json()); }
    } catch { setTwitterError("Lookup failed"); }
    finally { setTwitterLoading(false); }
  }

  // ── Auto-set question text when twitter info/question changes ─────────────
  useEffect(() => {
    if (!twitterInfo) return;
    if (twitterQuestion === "posts_count") {
      setQuestion(`How many posts will @${twitterInfo.username} make in 24 hours?`);
      setOutcomes(POSTS_COUNT_OUTCOMES);
    } else {
      setQuestion(`When will @${twitterInfo.username} make their next post?`);
      setOutcomes(NEXT_POST_OUTCOMES);
    }
  }, [twitterInfo, twitterQuestion]);

  // ── Crypto helpers ────────────────────────────────────────────────────────
  function addOutcome() {
    if (outcomes.length >= 6) return;
    setOutcomes(prev => [...prev, { id: OUTCOME_IDS[prev.length], label: "" }]);
  }
  function removeOutcome(idx: number) {
    if (outcomes.length <= 2) return;
    setOutcomes(prev => prev.filter((_, i) => i !== idx).map((o, i) => ({ ...o, id: OUTCOME_IDS[i] })));
  }
  function autoGenerateOutcomes() {
    if (!tokenInfo?.priceUsd) return;
    const p = tokenInfo.priceUsd;
    const fmt = (n: number) => p >= 1000 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(p < 0.01 ? 6 : 4)}`;
    setOutcomes([
      { id: "A", label: `Below ${fmt(p * 0.90)}` },
      { id: "B", label: `${fmt(p * 0.90)} – ${fmt(p * 0.97)}` },
      { id: "C", label: `${fmt(p * 0.97)} – ${fmt(p * 1.03)}` },
      { id: "D", label: `${fmt(p * 1.03)} – ${fmt(p * 1.10)}` },
      { id: "E", label: `Above ${fmt(p * 1.10)}` },
    ]);
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleCreate() {
    setCreating(true);
    setCreateError("");
    try {
      const token = getToken();
      const body: Record<string, unknown> = { question, outcomes, duration, description };

      if (category === "twitter" && twitterInfo) {
        body.twitterUsername    = twitterInfo.username;
        body.twitterUserId      = twitterInfo.id;
        body.twitterQuestion    = twitterQuestion;
        body.twitterPeriodHours = twitterQuestion === "posts_count" ? 24 : 24;
      } else {
        body.tokenAddress = tokenInfo?.address && tokenInfo.address !== tokenInfo.symbol
          ? tokenInfo.address : null;
        body.twitterUrl   = twitterUrl;
        body.customImage  = customImage;
      }

      const res = await fetch("/api/markets/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      router.push(`/rounds/${data.id}`);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create market");
      setCreating(false);
    }
  }

  // ── Validation ────────────────────────────────────────────────────────────
  const step1Valid = category === "twitter" ? !!twitterInfo : true;
  const step2Valid = category === "twitter" ? true : (question.trim().length >= 5 && question.trim().length <= 150);
  const step3Valid = outcomes.every(o => o.label.trim().length > 0);
  // For Twitter step 4, question is auto-generated so just need duration
  const step4Valid = category === "twitter"
    ? (question.trim().length > 0 && step3Valid)
    : step3Valid;

  function selectCategory(c: "crypto" | "twitter") {
    setCategory(c);
    setStep(1);
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-base pt-16">
        <Navbar rounds={[]} />
        <div className="flex flex-col items-center justify-center h-[calc(100vh-64px)] gap-4">
          <p className="text-white font-semibold">Login to create a market</p>
          <p className="text-muted text-sm">You need an account to create prediction markets.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base pt-16">
      <Navbar rounds={[]} />
      <div className="max-w-xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="text-muted hover:text-white transition-colors text-sm">← Markets</Link>
          <span className="text-muted">/</span>
          <span className="text-white font-semibold text-sm">Create Market</span>
        </div>

        {/* Cost banner */}
        <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-brand/5 border border-brand/20 mb-6 text-sm">
          <span className="text-white/70">Creation fee</span>
          <span className="font-mono font-bold text-brand">10 DORA</span>
          <span className="text-muted text-xs">Balance: {Math.floor(user.doraBalance).toLocaleString()} DORA</span>
        </div>

        {/* Step progress (only after category selected) */}
        {step >= 1 && (
          <div className="flex items-center gap-2 mb-8">
            {stepLabels.map((label, i) => {
              const n = i + 1;
              const active = n === step;
              const done   = n < step;
              return (
                <div key={n} className="flex items-center gap-2 flex-1">
                  <div className={`flex items-center gap-1.5 ${n < stepLabels.length ? "flex-1" : ""}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 transition-colors
                      ${active ? "bg-brand text-black" : done ? "bg-brand/30 text-brand" : "bg-surface-3 text-muted"}`}>
                      {done ? "✓" : n}
                    </div>
                    <span className={`text-xs ${active ? "text-white" : "text-muted"}`}>{label}</span>
                  </div>
                  {n < stepLabels.length && <div className={`flex-1 h-px ${done ? "bg-brand/40" : "bg-surface-3"}`} />}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Step 0: Category Selection ─────────────────────────── */}
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-white font-semibold mb-1">What type of market?</h2>
              <p className="text-muted text-xs mb-5">Choose a category to get started.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {/* Crypto card */}
              <button onClick={() => selectCategory("crypto")}
                className="flex flex-col items-center gap-3 p-6 rounded-xl border border-white/10 bg-surface-2 hover:border-brand/40 hover:bg-brand/5 transition-all group text-left">
                <span className="text-4xl">🪙</span>
                <div>
                  <p className="text-white font-semibold text-sm group-hover:text-brand transition-colors">Crypto</p>
                  <p className="text-muted text-xs mt-0.5">Price predictions on BTC, SOL, or any Solana token</p>
                </div>
              </button>
              {/* Twitter card */}
              <button onClick={() => selectCategory("twitter")}
                className="flex flex-col items-center gap-3 p-6 rounded-xl border border-white/10 bg-surface-2 hover:border-[#1d9bf0]/40 hover:bg-[#1d9bf0]/5 transition-all group text-left">
                <span className="text-4xl">
                  <svg className="w-10 h-10" viewBox="0 0 24 24" fill="white">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.858L1.808 2.25h6.946l4.258 5.63 5.232-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </span>
                <div>
                  <p className="text-white font-semibold text-sm group-hover:text-[#1d9bf0] transition-colors">Twitter / X</p>
                  <p className="text-muted text-xs mt-0.5">Predict posting activity of any public account</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ── CRYPTO FLOW ─────────────────────────────────────────────── */}
        {/* ══════════════════════════════════════════════════════════════════ */}

        {/* Crypto Step 1: Token */}
        {category === "crypto" && step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-white font-semibold mb-1">Token <span className="text-muted font-normal">(optional)</span></h2>
              <p className="text-muted text-xs mb-3">Paste a Solana contract address or type a symbol like BTC, SOL.</p>
              <input type="text" placeholder="e.g. BTC or EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
                value={tokenQuery} onChange={e => setTokenQuery(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-surface-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-brand transition-colors font-mono" />
              {tokenLoading && <p className="text-muted text-xs mt-1.5">Looking up token…</p>}
              {tokenError  && <p className="text-red-400 text-xs mt-1.5">{tokenError}</p>}
            </div>
            {tokenInfo && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-2 border border-surface-3">
                {tokenInfo.logoUrl
                  ? <img src={tokenInfo.logoUrl} alt={tokenInfo.symbol} className="w-10 h-10 rounded-full shrink-0" />
                  : <div className="w-10 h-10 rounded-full bg-brand/20 flex items-center justify-center text-brand font-bold text-sm shrink-0">{tokenInfo.symbol[0]}</div>}
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm">{tokenInfo.name} <span className="text-muted font-normal">({tokenInfo.symbol})</span></p>
                  <p className="text-brand font-mono text-xs">
                    ${tokenInfo.priceUsd >= 1000
                      ? tokenInfo.priceUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })
                      : tokenInfo.priceUsd.toFixed(tokenInfo.priceUsd < 0.01 ? 6 : 4)}
                    {tokenInfo.priceChange24h !== 0 && (
                      <span className={`ml-2 ${tokenInfo.priceChange24h >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {tokenInfo.priceChange24h >= 0 ? "▲" : "▼"}{Math.abs(tokenInfo.priceChange24h).toFixed(2)}%
                      </span>
                    )}
                  </p>
                </div>
                <button onClick={() => { setTokenQuery(""); setTokenInfo(null); }} className="text-muted hover:text-white text-xs">✕</button>
              </div>
            )}
            <div className="flex justify-between pt-2">
              <button onClick={() => { setCategory(null); setStep(0); }}
                className="px-4 py-2 rounded-lg bg-surface-2 border border-surface-3 text-muted hover:text-white text-sm transition-colors">← Back</button>
              <button onClick={() => setStep(2)}
                className="px-4 py-2 rounded-lg bg-brand hover:bg-brand-dim text-black font-semibold text-sm transition-colors">
                Next →
              </button>
            </div>
          </div>
        )}

        {/* Crypto Step 2: Details */}
        {category === "crypto" && step === 2 && (
          <div className="space-y-4">
            <h2 className="text-white font-semibold mb-3">Market Details</h2>
            <div>
              <label className="block text-xs text-muted mb-1">Question <span className="text-red-400">*</span></label>
              <input type="text" maxLength={150} placeholder="Will BTC close above $100k this week?"
                value={question} onChange={e => setQuestion(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-surface-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-brand transition-colors" />
              <p className="text-muted text-[10px] mt-1 text-right">{question.length}/150</p>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Description <span className="text-white/30">(optional)</span></label>
              <textarea maxLength={500} rows={3} placeholder="Add context, rules, or resolution criteria…"
                value={description} onChange={e => setDescription(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-surface-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-brand transition-colors resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted mb-1">Twitter / X link <span className="text-white/30">(optional)</span></label>
                <input type="url" placeholder="https://x.com/..." value={twitterUrl} onChange={e => setTwitterUrl(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-surface-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-brand transition-colors" />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Image URL <span className="text-white/30">(optional)</span></label>
                <input type="url" placeholder="https://..." value={customImage} onChange={e => setCustomImage(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-surface-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-brand transition-colors" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted mb-2">Duration</label>
              <div className="flex gap-2">
                {DURATIONS.map(d => (
                  <button key={d.value} onClick={() => setDuration(d.value)}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors
                      ${duration === d.value ? "bg-brand/10 border-brand/40 text-brand" : "bg-surface-2 border-surface-3 text-muted hover:text-white"}`}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(1)} className="px-4 py-2 rounded-lg bg-surface-2 border border-surface-3 text-muted hover:text-white text-sm transition-colors">← Back</button>
              <button onClick={() => setStep(3)} disabled={!step2Valid}
                className="px-4 py-2 rounded-lg bg-brand hover:bg-brand-dim text-black font-semibold text-sm transition-colors disabled:opacity-40">
                Next →
              </button>
            </div>
          </div>
        )}

        {/* Crypto Step 3: Outcomes */}
        {category === "crypto" && step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-semibold">Outcomes</h2>
              {tokenInfo?.priceUsd && (
                <button onClick={autoGenerateOutcomes} className="text-xs text-brand hover:text-brand-dim transition-colors">
                  ✦ Auto-generate from price
                </button>
              )}
            </div>
            <p className="text-muted text-xs">Add 2–6 outcomes. Each gets a letter label (A–F).</p>
            <div className="space-y-2">
              {outcomes.map((o, idx) => (
                <div key={o.id} className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded flex items-center justify-center text-[10px] font-bold bg-surface-3 text-muted shrink-0">{o.id}</span>
                  <input type="text" maxLength={80} placeholder={`Outcome ${o.id} label…`}
                    value={o.label} onChange={e => setOutcomes(prev => prev.map((x, i) => i === idx ? { ...x, label: e.target.value } : x))}
                    className="flex-1 px-3 py-2 rounded-lg bg-surface-2 border border-surface-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-brand transition-colors" />
                  {outcomes.length > 2 && (
                    <button onClick={() => removeOutcome(idx)} className="text-muted hover:text-red-400 transition-colors text-sm shrink-0">✕</button>
                  )}
                </div>
              ))}
            </div>
            {outcomes.length < 6 && (
              <button onClick={addOutcome}
                className="w-full py-2 rounded-lg border border-dashed border-surface-3 text-muted hover:text-white hover:border-surface-2 transition-colors text-xs">
                + Add outcome ({outcomes.length}/6)
              </button>
            )}
            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(2)} className="px-4 py-2 rounded-lg bg-surface-2 border border-surface-3 text-muted hover:text-white text-sm transition-colors">← Back</button>
              <button onClick={() => setStep(4)} disabled={!step3Valid}
                className="px-4 py-2 rounded-lg bg-brand hover:bg-brand-dim text-black font-semibold text-sm transition-colors disabled:opacity-40">
                Review →
              </button>
            </div>
          </div>
        )}

        {/* Crypto Step 4: Review */}
        {category === "crypto" && step === 4 && (
          <ReviewStep
            question={question} description={description} outcomes={outcomes} duration={duration}
            customImage={customImage} username={user.username} tokenInfo={tokenInfo}
            creating={creating} createError={createError}
            onBack={() => setStep(3)} onCreate={handleCreate}
          />
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ── TWITTER FLOW ────────────────────────────────────────────── */}
        {/* ══════════════════════════════════════════════════════════════════ */}

        {/* Twitter Step 1: Account */}
        {category === "twitter" && step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-white font-semibold mb-1">Twitter Account</h2>
              <p className="text-muted text-xs mb-3">Enter a public Twitter/X username to track.</p>
              <div className="flex gap-2">
                <input type="text" placeholder="@elonmusk"
                  value={twitterQuery} onChange={e => setTwitterQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && verifyTwitter()}
                  className="flex-1 px-3 py-2.5 rounded-lg bg-surface-2 border border-surface-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-[#1d9bf0] transition-colors font-mono" />
                <button onClick={verifyTwitter} disabled={twitterLoading || !twitterQuery.trim()}
                  className="px-4 py-2.5 rounded-lg bg-[#1d9bf0] hover:bg-[#1a8cd8] text-white font-semibold text-sm transition-colors disabled:opacity-40 shrink-0">
                  {twitterLoading ? "Checking…" : "Verify"}
                </button>
              </div>
              {twitterError && <p className="text-red-400 text-xs mt-1.5">{twitterError}</p>}
            </div>

            {twitterInfo && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-surface-2 border border-[#1d9bf0]/30">
                {twitterInfo.profileImageUrl
                  ? <img src={twitterInfo.profileImageUrl} alt={twitterInfo.username} className="w-12 h-12 rounded-full shrink-0" />
                  : <div className="w-12 h-12 rounded-full bg-[#1d9bf0]/20 flex items-center justify-center text-[#1d9bf0] font-bold text-lg shrink-0">
                      {twitterInfo.name[0]}
                    </div>}
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm">{twitterInfo.name}</p>
                  <p className="text-[#1d9bf0] text-xs font-mono">@{twitterInfo.username}</p>
                  <div className="flex gap-3 mt-1">
                    <span className="text-muted text-[10px]">
                      <span className="text-white/70 font-semibold">{twitterInfo.followersCount.toLocaleString()}</span> followers
                    </span>
                    <span className="text-muted text-[10px]">
                      <span className="text-white/70 font-semibold">{twitterInfo.tweetsCount.toLocaleString()}</span> posts
                    </span>
                  </div>
                </div>
                <button onClick={() => { setTwitterInfo(null); setTwitterQuery(""); }} className="text-muted hover:text-white text-xs">✕</button>
              </div>
            )}

            <div className="flex justify-between pt-2">
              <button onClick={() => { setCategory(null); setStep(0); }}
                className="px-4 py-2 rounded-lg bg-surface-2 border border-surface-3 text-muted hover:text-white text-sm transition-colors">← Back</button>
              <button onClick={() => setStep(2)} disabled={!step1Valid}
                className="px-4 py-2 rounded-lg bg-brand hover:bg-brand-dim text-black font-semibold text-sm transition-colors disabled:opacity-40">
                Next →
              </button>
            </div>
          </div>
        )}

        {/* Twitter Step 2: Question Type */}
        {category === "twitter" && step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-white font-semibold mb-1">Question Type</h2>
              <p className="text-muted text-xs mb-4">What do you want to predict about @{twitterInfo?.username}?</p>
            </div>
            <div className="space-y-3">
              {([
                { value: "posts_count",   label: "Post count in 24 hours",
                  desc: `How many posts will @${twitterInfo?.username} make in the next 24 hours?`,
                  icon: "📊" },
                { value: "next_post_time", label: "Time until next post",
                  desc: `When will @${twitterInfo?.username} make their next post?`,
                  icon: "⏱" },
              ] as const).map(opt => (
                <button key={opt.value} onClick={() => setTwitterQuestion(opt.value)}
                  className={`w-full flex items-start gap-3 p-4 rounded-xl border text-left transition-all
                    ${twitterQuestion === opt.value
                      ? "border-brand/50 bg-brand/5"
                      : "border-white/10 bg-surface-2 hover:border-white/20"}`}>
                  <span className="text-2xl shrink-0">{opt.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-semibold ${twitterQuestion === opt.value ? "text-brand" : "text-white"}`}>{opt.label}</p>
                      {twitterQuestion === opt.value && <span className="text-[10px] text-brand">✓</span>}
                    </div>
                    <p className="text-muted text-xs mt-0.5">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(1)} className="px-4 py-2 rounded-lg bg-surface-2 border border-surface-3 text-muted hover:text-white text-sm transition-colors">← Back</button>
              <button onClick={() => setStep(3)}
                className="px-4 py-2 rounded-lg bg-brand hover:bg-brand-dim text-black font-semibold text-sm transition-colors">
                Next →
              </button>
            </div>
          </div>
        )}

        {/* Twitter Step 3: Outcomes */}
        {category === "twitter" && step === 3 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-white font-semibold mb-1">Outcomes</h2>
              <p className="text-muted text-xs mb-1">Auto-generated based on your question type. Edit labels if needed.</p>
            </div>
            <div className="space-y-2">
              {outcomes.map((o, idx) => (
                <div key={o.id} className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded flex items-center justify-center text-[10px] font-bold bg-surface-3 text-muted shrink-0">{o.id}</span>
                  <input type="text" maxLength={80} value={o.label}
                    onChange={e => setOutcomes(prev => prev.map((x, i) => i === idx ? { ...x, label: e.target.value } : x))}
                    className="flex-1 px-3 py-2 rounded-lg bg-surface-2 border border-surface-3 text-white text-sm focus:outline-none focus:border-brand transition-colors" />
                </div>
              ))}
            </div>
            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(2)} className="px-4 py-2 rounded-lg bg-surface-2 border border-surface-3 text-muted hover:text-white text-sm transition-colors">← Back</button>
              <button onClick={() => setStep(4)} disabled={!step3Valid}
                className="px-4 py-2 rounded-lg bg-brand hover:bg-brand-dim text-black font-semibold text-sm transition-colors disabled:opacity-40">
                Next →
              </button>
            </div>
          </div>
        )}

        {/* Twitter Step 4: Details + Review */}
        {category === "twitter" && step === 4 && (
          <div className="space-y-4">
            <h2 className="text-white font-semibold">Details &amp; Review</h2>

            {/* Duration */}
            <div>
              <label className="block text-xs text-muted mb-2">Duration</label>
              <div className="flex gap-2">
                {DURATIONS.map(d => (
                  <button key={d.value} onClick={() => setDuration(d.value)}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors
                      ${duration === d.value ? "bg-brand/10 border-brand/40 text-brand" : "bg-surface-2 border-surface-3 text-muted hover:text-white"}`}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs text-muted mb-1">Description <span className="text-white/30">(optional)</span></label>
              <textarea maxLength={500} rows={2} placeholder="Add resolution criteria or context…"
                value={description} onChange={e => setDescription(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-surface-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-brand transition-colors resize-none" />
            </div>

            {/* Preview */}
            <div className="rounded-xl border border-white/8 bg-[#0d0f14] overflow-hidden">
              <div className="flex items-center gap-3 p-4">
                {twitterInfo?.profileImageUrl
                  ? <img src={twitterInfo.profileImageUrl} alt={twitterInfo?.username} className="w-10 h-10 rounded-full shrink-0" />
                  : <div className="w-10 h-10 rounded-full bg-[#1d9bf0]/20 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-[#1d9bf0]" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.858L1.808 2.25h6.946l4.258 5.63 5.232-5.63z"/>
                      </svg>
                    </div>}
                <div>
                  <p className="text-white font-semibold text-sm">@{twitterInfo?.username}</p>
                  <p className="text-white/60 text-xs">{question}</p>
                </div>
              </div>
              <div className="px-4 pb-4 grid grid-cols-2 gap-1.5">
                {outcomes.map(o => (
                  <div key={o.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/8 text-[11px]">
                    <span className="font-bold text-muted">{o.id}</span>
                    <span className="text-white/70 truncate">{o.label}</span>
                  </div>
                ))}
              </div>
              <div className="px-4 pb-3 flex justify-between text-[10px] text-muted border-t border-white/5 pt-2">
                <span>Created by <span className="text-white">{user.username}</span></span>
                <span>{DURATIONS.find(d => d.value === duration)?.label} · {outcomes.length} outcomes</span>
              </div>
            </div>

            {/* Cost */}
            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-surface-2 border border-surface-3 text-sm">
              <span className="text-muted">Creation fee</span>
              <span className="font-mono font-bold text-white">10 DORA</span>
            </div>

            {createError && <p className="text-red-400 text-sm px-1">{createError}</p>}

            <div className="flex justify-between pt-1">
              <button onClick={() => setStep(3)} disabled={creating}
                className="px-4 py-2 rounded-lg bg-surface-2 border border-surface-3 text-muted hover:text-white text-sm transition-colors disabled:opacity-40">← Back</button>
              <button onClick={handleCreate} disabled={creating || !step4Valid}
                className="px-6 py-2.5 rounded-lg bg-brand hover:bg-brand-dim text-black font-bold text-sm transition-colors disabled:opacity-40 flex items-center gap-2">
                {creating && <svg className="animate-spin w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>}
                {creating ? "Creating…" : "Create Market (10 DORA)"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Crypto review step (extracted to keep JSX manageable) ──────────────────────

function ReviewStep({ question, description, outcomes, duration, customImage, username, tokenInfo, creating, createError, onBack, onCreate }: {
  question: string; description: string; outcomes: OutcomeInput[]; duration: number;
  customImage: string; username: string; tokenInfo: TokenInfo | null;
  creating: boolean; createError: string; onBack: () => void; onCreate: () => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-white font-semibold">Review &amp; Create</h2>
      <div className="rounded-xl border border-surface-3 bg-surface overflow-hidden">
        {customImage && <img src={customImage} alt="Market" className="w-full h-28 object-cover" />}
        <div className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border bg-purple-500/10 text-purple-400 border-purple-500/20">Community</span>
            {tokenInfo && (
              <div className="flex items-center gap-1">
                {tokenInfo.logoUrl && <img src={tokenInfo.logoUrl} alt={tokenInfo.symbol} className="w-4 h-4 rounded-full" />}
                <span className="text-[10px] text-muted font-mono">{tokenInfo.symbol}</span>
              </div>
            )}
            <span className="ml-auto text-[10px] text-muted">{DURATIONS.find(d => d.value === duration)?.label}</span>
          </div>
          <p className="text-white text-sm font-medium mb-3">{question}</p>
          {description && <p className="text-muted text-xs mb-3">{description}</p>}
          <div className="grid grid-cols-2 gap-1.5">
            {outcomes.map(o => (
              <div key={o.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-2 border border-surface-3 text-[11px]">
                <span className="font-bold text-muted">{o.id}</span>
                <span className="text-white/70 truncate">{o.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="px-4 pb-3 flex items-center justify-between text-[10px] text-muted border-t border-surface-3/50 pt-2">
          <span>Created by <span className="text-white">{username}</span></span>
          <span>{outcomes.length} outcomes · LMSR</span>
        </div>
      </div>
      <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-surface-2 border border-surface-3 text-sm">
        <span className="text-muted">Creation fee</span>
        <span className="font-mono font-bold text-white">10 DORA</span>
      </div>
      {createError && <p className="text-red-400 text-sm px-1">{createError}</p>}
      <div className="flex justify-between pt-1">
        <button onClick={onBack} disabled={creating}
          className="px-4 py-2 rounded-lg bg-surface-2 border border-surface-3 text-muted hover:text-white text-sm transition-colors disabled:opacity-40">← Back</button>
        <button onClick={onCreate} disabled={creating}
          className="px-6 py-2.5 rounded-lg bg-brand hover:bg-brand-dim text-black font-bold text-sm transition-colors disabled:opacity-40 flex items-center gap-2">
          {creating && <svg className="animate-spin w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>}
          {creating ? "Creating…" : "Create Market (10 DORA)"}
        </button>
      </div>
    </div>
  );
}
