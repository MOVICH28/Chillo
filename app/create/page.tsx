"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/lib/useAuth";

const SNAP_POINTS = [1, 3, 5, 10, 15, 30, 45, 60, 90, 120, 180, 240, 360, 480, 720, 1440];

function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  if (min < 120) return `1h${min > 60 ? ` ${min - 60}min` : ""}`;
  return `${Math.round(min / 60)}h`;
}

// Twitter durations (legacy — betting closes = ends - 5min)
const TWITTER_DURATIONS = [
  { label: "15 min", value: 15 },
  { label: "1h",     value: 60 },
  { label: "4h",     value: 240 },
  { label: "24h",    value: 1440 },
];

const POSTS_COUNT_OUTCOMES = [
  { id: "A", label: "0–2 posts",    minPrice: null, maxPrice: null },
  { id: "B", label: "3–5 posts",    minPrice: null, maxPrice: null },
  { id: "C", label: "6–10 posts",   minPrice: null, maxPrice: null },
  { id: "D", label: "11–20 posts",  minPrice: null, maxPrice: null },
  { id: "E", label: "21–50 posts",  minPrice: null, maxPrice: null },
  { id: "F", label: "50+ posts",    minPrice: null, maxPrice: null },
];

const NEXT_POST_OUTCOMES = [
  { id: "A", label: "Within 1 hour",      minPrice: null, maxPrice: null },
  { id: "B", label: "1–3 hours",          minPrice: null, maxPrice: null },
  { id: "C", label: "3–6 hours",          minPrice: null, maxPrice: null },
  { id: "D", label: "6–12 hours",         minPrice: null, maxPrice: null },
  { id: "E", label: "12–24 hours",        minPrice: null, maxPrice: null },
  { id: "F", label: "More than 24 hours", minPrice: null, maxPrice: null },
];

const MCAP_OUTCOME_DEFAULTS = [
  { id: "A", label: "Below $100K",      minPrice: null,       maxPrice: 100_000    },
  { id: "B", label: "$100K – $500K",    minPrice: 100_000,    maxPrice: 500_000    },
  { id: "C", label: "$500K – $1M",      minPrice: 500_000,    maxPrice: 1_000_000  },
  { id: "D", label: "$1M – $5M",        minPrice: 1_000_000,  maxPrice: 5_000_000  },
  { id: "E", label: "$5M – $10M",       minPrice: 5_000_000,  maxPrice: 10_000_000 },
  { id: "F", label: "Above $10M",       minPrice: 10_000_000, maxPrice: null       },
];

type CryptoQType = "price" | "ath_mcap" | "mcap";

// ── Smart builder helpers ─────────────────────────────────────────────────────

const OUTCOME_IDS = ["A","B","C","D","E","F"];

function getPriceSteps(p: number): number[] {
  if (p >= 10_000) return [100, 500, 1_000, 5_000, 10_000];
  if (p >= 1)      return [0.5, 1, 2, 5, 10];
  return [0.00001, 0.0001, 0.001, 0.01];
}

function defaultStepIdx(p: number): number {
  return Math.floor(getPriceSteps(p).length / 2);
}

function formatMcap(v: number): string {
  if (v <= 0)            return "$0";
  if (v < 1_000)         return `$${v.toFixed(0)}`;
  if (v < 1_000_000)     return `$${(v / 1_000).toFixed(1)}K`;
  if (v < 1_000_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  return `$${(v / 1_000_000_000).toFixed(2)}B`;
}

/** Build price outcomes. Boundaries placed symmetrically around center. */
function buildPriceOutcomesNew(step: number, center: number, numRanges: number, refPrice: number): OutcomeInput[] {
  const fmt  = (n: number) => fmtPrice(Math.max(0, n), refPrice);
  const s    = Math.max(step, 1e-12);
  const n    = Math.max(2, Math.min(6, numRanges));
  if (n === 2) return [
    { id: "A", label: `Below ${fmt(center)}`,     minPrice: null,   maxPrice: center },
    { id: "B", label: `${fmt(center)} and above`, minPrice: center, maxPrice: null   },
  ];
  const start      = center - Math.floor((n - 2) / 2) * s;
  const boundaries = Array.from({ length: n - 1 }, (_, i) => start + i * s);
  const out: OutcomeInput[] = [];
  out.push({ id: OUTCOME_IDS[0], label: `Below ${fmt(boundaries[0])}`, minPrice: null, maxPrice: boundaries[0] });
  for (let i = 0; i < n - 2; i++)
    out.push({ id: OUTCOME_IDS[i+1], label: `${fmt(boundaries[i])} – ${fmt(boundaries[i+1])}`, minPrice: boundaries[i], maxPrice: boundaries[i+1] });
  out.push({ id: OUTCOME_IDS[n-1], label: `Above ${fmt(boundaries[n-2])}`, minPrice: boundaries[n-2], maxPrice: null });
  return out;
}

/** Build mcap outcomes on a linear (equal-dollar) scale. */
function buildLinearOutcomesNew(minVal: number, maxVal: number, numRanges: number): OutcomeInput[] {
  const n      = Math.max(2, Math.min(6, numRanges));
  const lo     = Math.max(0, minVal);
  const hi     = Math.max(lo + 1, maxVal);
  if (n === 2) { const m = (lo + hi) / 2; return [
    { id: "A", label: `Below ${formatMcap(m)}`,     minPrice: null, maxPrice: m },
    { id: "B", label: `${formatMcap(m)} and above`, minPrice: m,    maxPrice: null },
  ]; }
  const step       = (hi - lo) / (n - 2);
  const boundaries = Array.from({ length: n - 1 }, (_, i) => lo + i * step);
  const out: OutcomeInput[] = [];
  out.push({ id: OUTCOME_IDS[0], label: `Below ${formatMcap(boundaries[0])}`, minPrice: null, maxPrice: boundaries[0] });
  for (let i = 0; i < n - 2; i++)
    out.push({ id: OUTCOME_IDS[i+1], label: `${formatMcap(boundaries[i])} – ${formatMcap(boundaries[i+1])}`, minPrice: boundaries[i], maxPrice: boundaries[i+1] });
  out.push({ id: OUTCOME_IDS[n-1], label: `Above ${formatMcap(boundaries[n-2])}`, minPrice: boundaries[n-2], maxPrice: null });
  return out;
}

/** Build mcap outcomes on a logarithmic (equal-percentage) scale. */
function buildLogOutcomesNew(minVal: number, maxVal: number, numRanges: number): OutcomeInput[] {
  const n      = Math.max(2, Math.min(6, numRanges));
  const lo     = Math.max(1, minVal);
  const hi     = Math.max(lo * 2, maxVal);
  const lMin   = Math.log10(lo);
  const lMax   = Math.log10(hi);
  if (n === 2) { const m = Math.pow(10, (lMin + lMax) / 2); return [
    { id: "A", label: `Below ${formatMcap(m)}`,     minPrice: null, maxPrice: m },
    { id: "B", label: `${formatMcap(m)} and above`, minPrice: m,    maxPrice: null },
  ]; }
  const lStep      = (lMax - lMin) / (n - 2);
  const boundaries = Array.from({ length: n - 1 }, (_, i) => Math.pow(10, lMin + i * lStep));
  const out: OutcomeInput[] = [];
  out.push({ id: OUTCOME_IDS[0], label: `Below ${formatMcap(boundaries[0])}`, minPrice: null, maxPrice: boundaries[0] });
  for (let i = 0; i < n - 2; i++)
    out.push({ id: OUTCOME_IDS[i+1], label: `${formatMcap(boundaries[i])} – ${formatMcap(boundaries[i+1])}`, minPrice: boundaries[i], maxPrice: boundaries[i+1] });
  out.push({ id: OUTCOME_IDS[n-1], label: `Above ${formatMcap(boundaries[n-2])}`, minPrice: boundaries[n-2], maxPrice: null });
  return out;
}

interface TokenInfo {
  name: string;
  symbol: string;
  priceUsd: number;
  mcapUsd: number;
  priceChange24h: number;
  volume24h: number;
  logoUrl: string | null;
  address: string;
  isPumpFun?: boolean;
}

interface OutcomeInput {
  id: string;
  label: string;
  minPrice?: number | null;
  maxPrice?: number | null;
}

function validTwitterUsername(u: string): boolean {
  const clean = u.replace(/^@/, "");
  return /^[A-Za-z0-9_]{1,15}$/.test(clean);
}

function fmtPrice(n: number, ref: number): string {
  if (ref >= 1000) return `$${Math.round(n).toLocaleString()}`;
  return `$${n.toFixed(ref < 0.01 ? 6 : 4)}`;
}

// ── Image upload ──────────────────────────────────────────────────────────────

function resizeToSquare(file: File): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1000;
      canvas.height = 1000;
      const ctx = canvas.getContext("2d")!;
      const size = Math.min(img.width, img.height);
      const x = (img.width - size) / 2;
      const y = (img.height - size) / 2;
      ctx.drawImage(img, x, y, size, size, 0, 0, 1000, 1000);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

function ImageUploadZone({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [err, setErr] = useState("");

  async function handleFile(file: File) {
    setErr("");
    if (!file.type.startsWith("image/")) { setErr("Only image files allowed"); return; }
    if (file.size > 2 * 1024 * 1024)    { setErr("Max 2MB"); return; }
    try {
      const b64 = await resizeToSquare(file);
      onChange(b64);
    } catch { setErr("Failed to process image"); }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div className="flex items-start gap-3">
      {/* Square zone / preview */}
      {value ? (
        <div className="relative w-[120px] h-[120px] shrink-0">
          <img src={value} alt="Market" className="w-full h-full object-cover rounded-lg border border-white/10" />
          <button
            onClick={() => onChange("")}
            className="absolute top-1 right-1 w-5 h-5 rounded flex items-center justify-center text-[10px] bg-black/70 text-white hover:bg-red-500/80 transition-colors"
          >✕</button>
        </div>
      ) : (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`w-[120px] h-[120px] rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors shrink-0
            ${dragging ? "border-brand/60 bg-brand/5" : "border-white/15 hover:border-white/30"}`}
        >
          <span className="text-2xl">🖼</span>
          <span className="text-white/30 text-[10px] text-center leading-tight px-1">Click or<br/>drop here</span>
        </div>
      )}

      {/* Instructions on the right */}
      <div className="flex flex-col gap-1 pt-1 min-w-0">
        {value ? (
          <>
            <p className="text-white/60 text-xs font-medium">Image ready</p>
            <p className="text-white/30 text-[10px]">1000 × 1000 · JPEG</p>
            <button onClick={() => onChange("")} className="text-red-400/70 hover:text-red-400 text-xs transition-colors mt-0.5 text-left">Remove</button>
          </>
        ) : (
          <>
            <p className="text-white/50 text-xs font-medium">Market image <span className="text-white/25 font-normal">(optional)</span></p>
            <p className="text-white/30 text-[10px] leading-relaxed">
              Square format required<br/>
              1000×1000px recommended<br/>
              PNG, JPG, WebP · max 2MB
            </p>
          </>
        )}
        {err && <p className="text-red-400 text-xs mt-1">{err}</p>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

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
  const [isPumpFun,    setIsPumpFun]    = useState(false);

  // ── Crypto: Step 2 — question type + timeframe ────────────────────────────
  const [cryptoQType,        setCryptoQType]        = useState<CryptoQType>("price");
  const [betDuration,        setBetDuration]        = useState(60);
  const [description,        setDescription]        = useState("");
  const [uploadedImage,      setUploadedImage]      = useState("");
  const [imageIsAutoDetected, setImageIsAutoDetected] = useState(false);
  const [twitterUrl,         setTwitterUrl]         = useState("");

  // ── Crypto: Step 3 — outcome range builder ───────────────────────────────
  const [priceStepInput,   setPriceStepInput]   = useState("");
  const [priceCenterInput, setPriceCenterInput] = useState("");
  const [priceNumRanges,   setPriceNumRanges]   = useState(6);
  const [mcapMinInput,     setMcapMinInput]     = useState("");
  const [mcapMaxInput,     setMcapMaxInput]     = useState("");
  const [mcapScaleType,    setMcapScaleType]    = useState<"linear" | "logarithmic">("logarithmic");
  const [mcapNumRanges,    setMcapNumRanges]    = useState(6);

  // ── Twitter: Step 1 — account ─────────────────────────────────────────────
  const [twitterQuery,    setTwitterQuery]    = useState("");
  const [avatarError,     setAvatarError]     = useState(false);
  const [twitterDuration, setTwitterDuration] = useState(1440);

  // ── Twitter: Step 2 — question type ──────────────────────────────────────
  const [twitterQuestion, setTwitterQuestion] = useState<"posts_count" | "next_post_time">("posts_count");

  // ── Shared: question + outcomes ───────────────────────────────────────────
  const [question, setQuestion] = useState("");
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
    : ["Token",   "Question", "Outcomes", "Review"];

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

  // Auto-detect pump.fun when token changes
  useEffect(() => {
    setIsPumpFun(tokenInfo?.isPumpFun ?? false);
  }, [tokenInfo]);

  // Auto-set market image from token logo when token loads
  useEffect(() => {
    if (tokenInfo?.logoUrl) {
      setUploadedImage(tokenInfo.logoUrl);
      setImageIsAutoDetected(true);
    } else if (!tokenInfo) {
      setImageIsAutoDetected(false);
    }
  }, [tokenInfo]);

  // ── Auto-generate crypto question from type + token + timeframe ───────────
  useEffect(() => {
    if (category !== "crypto") return;
    const sym = tokenInfo?.symbol ?? (tokenQuery.trim() || "Token");
    const tf  = formatDuration(betDuration);
    switch (cryptoQType) {
      case "price":    setQuestion(`What price will ${sym} reach in ${tf}?`); break;
      case "ath_mcap": setQuestion(`What ATH market cap will ${sym} reach in ${tf}?`); break;
      case "mcap":     setQuestion(`What will ${sym}'s market cap be after ${tf}?`); break;
    }
  }, [cryptoQType, tokenInfo, tokenQuery, betDuration, category]);

  // ── Reset builder inputs when question type or token changes ─────────────
  useEffect(() => {
    if (category !== "crypto") return;
    const price = tokenInfo?.priceUsd ?? 0;
    const mcap  = tokenInfo?.mcapUsd  ?? 0;
    if (cryptoQType === "price" && price > 0) {
      const steps = getPriceSteps(price);
      setPriceStepInput(String(steps[defaultStepIdx(price)]));
      setPriceCenterInput(String(price));
    }
    if ((cryptoQType === "mcap" || cryptoQType === "ath_mcap") && mcap > 0) {
      setMcapMinInput(String(Math.round(mcap * 0.5)));
      setMcapMaxInput(String(Math.round(mcap * 10)));
    }
  }, [cryptoQType, tokenInfo, category]);

  // ── Recompute outcomes from builder state ────────────────────────────────
  useEffect(() => {
    if (category !== "crypto") return;
    const price = tokenInfo?.priceUsd ?? 0;

    if (cryptoQType === "price" && price > 0) {
      const step   = parseFloat(priceStepInput);
      const center = parseFloat(priceCenterInput);
      if (step > 0 && center > 0) {
        setOutcomes(buildPriceOutcomesNew(step, center, priceNumRanges, price));
      }
    } else if (cryptoQType === "mcap" || cryptoQType === "ath_mcap") {
      const minV = parseFloat(mcapMinInput);
      const maxV = parseFloat(mcapMaxInput);
      if (minV > 0 && maxV > minV) {
        setOutcomes(
          mcapScaleType === "logarithmic"
            ? buildLogOutcomesNew(minV, maxV, mcapNumRanges)
            : buildLinearOutcomesNew(minV, maxV, mcapNumRanges)
        );
      } else {
        setOutcomes(MCAP_OUTCOME_DEFAULTS.slice(0, mcapNumRanges).map(o => ({ ...o })));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cryptoQType, priceStepInput, priceCenterInput, priceNumRanges, mcapMinInput, mcapMaxInput, mcapScaleType, mcapNumRanges, tokenInfo, category]);

  // ── Twitter auto-question ─────────────────────────────────────────────────
  const cleanTwitter     = twitterQuery.replace(/^@/, "").trim();
  const twitterAvatarUrl = cleanTwitter ? `https://unavatar.io/twitter/${cleanTwitter}` : null;
  useEffect(() => { setAvatarError(false); }, [cleanTwitter]);

  useEffect(() => {
    if (!cleanTwitter) return;
    if (twitterQuestion === "posts_count") {
      setQuestion(`How many posts will @${cleanTwitter} make in 24h?`);
      setOutcomes(POSTS_COUNT_OUTCOMES.map(o => ({ ...o })));
    } else {
      setQuestion(`When will @${cleanTwitter} make their next post?`);
      setOutcomes(NEXT_POST_OUTCOMES.map(o => ({ ...o })));
    }
  }, [cleanTwitter, twitterQuestion]);

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleCreate() {
    setCreating(true);
    setCreateError("");
    try {
      const token = getToken();
      const body: Record<string, unknown> = { question, outcomes, description };

      if (category === "twitter" && cleanTwitter) {
        body.duration           = twitterDuration;
        body.twitterUsername    = cleanTwitter;
        body.twitterUserId      = null;
        body.twitterQuestion    = twitterQuestion;
        body.twitterPeriodHours = 24;
        body.tokenLogo          = `https://unavatar.io/twitter/${cleanTwitter}`;
      } else {
        body.betDuration  = betDuration;
        body.questionType = cryptoQType;
        body.tokenAddress = tokenInfo?.address && tokenInfo.address !== tokenInfo.symbol
          ? tokenInfo.address : null;
        body.twitterUrl   = twitterUrl;
        body.customImage  = uploadedImage || null;
        body.isPumpFun    = isPumpFun;
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
  const step1Valid = category === "twitter" ? validTwitterUsername(twitterQuery) : true;
  const step2Valid = question.trim().length >= 5;
  const step3Valid = outcomes.every(o => o.label.trim().length > 0);
  const step4Valid = step3Valid && question.trim().length > 0;

  function selectCategory(c: "crypto" | "twitter") {
    setCategory(c);
    setStep(1);
  }

  // For ≤3 min rounds use 2-min buffer; otherwise 5 min
  const resultBuffer    = betDuration <= 3 ? 2 : 5;
  const tfLabel         = formatDuration(betDuration);
  const bettingClosesIn = tfLabel;

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

        {/* Step progress */}
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
              <button onClick={() => selectCategory("crypto")}
                className="flex flex-col items-center gap-3 p-6 rounded-xl border border-white/10 bg-surface-2 hover:border-brand/40 hover:bg-brand/5 transition-all group text-left">
                <span className="text-4xl">🪙</span>
                <div>
                  <p className="text-white font-semibold text-sm group-hover:text-brand transition-colors">Crypto</p>
                  <p className="text-muted text-xs mt-0.5">Price predictions on BTC, SOL, or any Solana token</p>
                </div>
              </button>
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

        {/* ══ CRYPTO FLOW ══════════════════════════════════════════════ */}

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
              {tokenError   && <p className="text-red-400 text-xs mt-1.5">{tokenError}</p>}
            </div>
            {tokenInfo && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-2 border border-surface-3">
                {tokenInfo.logoUrl
                  ? <img src={tokenInfo.logoUrl} alt={tokenInfo.symbol} className="w-10 h-10 rounded-full shrink-0" />
                  : <div className="w-10 h-10 rounded-full bg-brand/20 flex items-center justify-center text-brand font-bold text-sm shrink-0">{tokenInfo.symbol[0]}</div>}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-white font-semibold text-sm">{tokenInfo.name} <span className="text-muted font-normal">({tokenInfo.symbol})</span></p>
                    {isPumpFun && (
                      <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold border bg-gradient-to-r from-orange-500/10 to-green-500/10 text-orange-400 border-orange-500/20">
                        pump.fun
                      </span>
                    )}
                  </div>
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
            {tokenInfo && (
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isPumpFun}
                  onChange={e => setIsPumpFun(e.target.checked)}
                  className="w-4 h-4 rounded accent-orange-400"
                />
                <span className="text-sm text-white/70">This is a pump.fun token</span>
                {tokenInfo.isPumpFun && isPumpFun && (
                  <span className="text-[10px] text-orange-400/60">auto-detected</span>
                )}
              </label>
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

        {/* Crypto Step 2: Image + Question Type + Timeframe */}
        {category === "crypto" && step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-white font-semibold mb-1">Market Setup</h2>
              <p className="text-muted text-xs mb-4">Add an image and choose what you want to predict.</p>
            </div>

            {/* Image — auto-detected or manual upload */}
            {uploadedImage && imageIsAutoDetected ? (
              <div className="flex items-start gap-3">
                <div className="relative shrink-0">
                  <img src={uploadedImage} alt="Token logo" className="w-20 h-20 rounded-lg object-cover border border-white/10" />
                  <span className="absolute -top-1.5 -right-1.5 text-[9px] bg-brand text-black font-bold px-1.5 py-0.5 rounded leading-tight">Auto</span>
                </div>
                <div className="flex flex-col gap-1 pt-1">
                  <p className="text-white/60 text-xs font-medium">Auto-detected image</p>
                  <p className="text-white/30 text-[10px]">Token logo from DexScreener</p>
                  <button
                    onClick={() => { setUploadedImage(""); setImageIsAutoDetected(false); }}
                    className="text-white/40 hover:text-white text-xs transition-colors mt-1 text-left"
                  >Change image</button>
                </div>
              </div>
            ) : (
              <ImageUploadZone
                value={uploadedImage}
                onChange={v => { setUploadedImage(v); setImageIsAutoDetected(false); }}
              />
            )}

            {/* Question type */}
            <div>
              <label className="block text-xs text-muted mb-2">Question type</label>
              <div className="space-y-2">
                {([
                  { value: "price"    as CryptoQType, icon: "📈", label: "Price",          desc: `What price will ${tokenInfo?.symbol ?? "the token"} reach?` },
                  { value: "ath_mcap" as CryptoQType, icon: "🏆", label: "ATH Market Cap", desc: `What's the highest market cap it will hit in the window?` },
                  { value: "mcap"     as CryptoQType, icon: "💰", label: "End Market Cap",  desc: `What will market cap be when betting closes?` },
                ]).map(opt => (
                  <button key={opt.value} onClick={() => setCryptoQType(opt.value)}
                    className={`w-full flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all
                      ${cryptoQType === opt.value ? "border-brand/50 bg-brand/5" : "border-white/8 bg-surface-2 hover:border-white/15"}`}>
                    <span className="text-xl shrink-0">{opt.icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-semibold ${cryptoQType === opt.value ? "text-brand" : "text-white"}`}>{opt.label}</p>
                        {cryptoQType === opt.value && <span className="text-[10px] text-brand">✓</span>}
                      </div>
                      <p className="text-muted text-xs mt-0.5">{opt.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Question preview */}
            <div className="px-3 py-2.5 rounded-lg bg-surface-2 border border-surface-3">
              <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">Question preview</p>
              <p className="text-white text-sm font-medium">{question || "…"}</p>
            </div>

            {/* Betting window slider */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-muted">Betting window</label>
                <span className="text-xs font-semibold text-white">{bettingClosesIn}</span>
              </div>
              <input
                type="range"
                min={0}
                max={SNAP_POINTS.length - 1}
                value={SNAP_POINTS.indexOf(betDuration) !== -1 ? SNAP_POINTS.indexOf(betDuration) : 6}
                onChange={e => setBetDuration(SNAP_POINTS[Number(e.target.value)])}
                className="w-full accent-brand cursor-pointer"
              />
              <p className="mt-1.5 text-[11px] text-white/40">
                Betting: <span className="text-white">{bettingClosesIn}</span>
                {" · "}Result: <span className="text-brand">+{resultBuffer}min after close</span>
              </p>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs text-muted mb-1">Description <span className="text-white/30">(optional)</span></label>
              <textarea maxLength={500} rows={2} placeholder="Add context or resolution criteria…"
                value={description} onChange={e => setDescription(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-surface-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-brand transition-colors resize-none" />
            </div>

            {/* Twitter link */}
            <div>
              <label className="block text-xs text-muted mb-1">Twitter / X link <span className="text-white/30">(optional)</span></label>
              <input type="url" placeholder="https://x.com/..."
                value={twitterUrl} onChange={e => setTwitterUrl(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-surface-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-brand transition-colors" />
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

        {/* Crypto Step 3: Outcome Range Builder */}
        {category === "crypto" && step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-white font-semibold mb-1">Outcome Ranges</h2>
              <p className="text-muted text-xs">Set the ranges below — type exact values or use presets. Outcomes update live.</p>
            </div>

            {/* ── Price builder ── */}
            {cryptoQType === "price" && tokenInfo && tokenInfo.priceUsd > 0 && (
              <div className="space-y-4 p-4 rounded-xl bg-surface-2 border border-surface-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted">Current price</span>
                  <span className="text-brand font-mono font-semibold">{fmtPrice(tokenInfo.priceUsd, tokenInfo.priceUsd)}</span>
                </div>

                {/* Step size */}
                <div>
                  <label className="block text-xs text-muted mb-1.5">Step size</label>
                  <input
                    type="number" step="any" min="0"
                    value={priceStepInput}
                    onChange={e => setPriceStepInput(e.target.value)}
                    placeholder={`e.g. ${getPriceSteps(tokenInfo.priceUsd)[defaultStepIdx(tokenInfo.priceUsd)]}`}
                    className="w-full px-3 py-2 rounded-lg bg-surface border border-surface-3 text-white text-sm font-mono focus:outline-none focus:border-brand transition-colors"
                  />
                </div>

                {/* Center price */}
                <div>
                  <label className="block text-xs text-muted mb-1.5">Center price</label>
                  <input
                    type="number" step="any" min="0"
                    value={priceCenterInput}
                    onChange={e => setPriceCenterInput(e.target.value)}
                    placeholder={`e.g. ${tokenInfo.priceUsd}`}
                    className="w-full px-3 py-2 rounded-lg bg-surface border border-surface-3 text-white text-sm font-mono focus:outline-none focus:border-brand transition-colors"
                  />
                  <button onClick={() => setPriceCenterInput(String(tokenInfo.priceUsd))}
                    className="mt-1 text-[10px] text-muted hover:text-brand transition-colors">
                    Reset to current price
                  </button>
                </div>

                {/* Number of ranges */}
                <div>
                  <label className="block text-xs text-muted mb-1.5">Number of ranges</label>
                  <div className="flex gap-1.5">
                    {[2,3,4,5,6].map(n => (
                      <button key={n} onClick={() => setPriceNumRanges(n)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors
                          ${priceNumRanges === n
                            ? "bg-brand/20 border-brand/40 text-brand"
                            : "bg-surface border-surface-3 text-muted hover:text-white"}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Price builder fallback when no token yet */}
            {cryptoQType === "price" && (!tokenInfo || tokenInfo.priceUsd === 0) && (
              <p className="text-yellow-400/80 text-xs px-1">No token selected — add a token in Step 1 to enable the price range builder.</p>
            )}

            {/* ── Mcap / ATH mcap builder ── */}
            {(cryptoQType === "mcap" || cryptoQType === "ath_mcap") && (
              <div className="space-y-4 p-4 rounded-xl bg-surface-2 border border-surface-3">
                {tokenInfo && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted">Current {cryptoQType === "ath_mcap" ? "ATH" : ""} market cap</span>
                    <span className={`font-mono font-semibold ${(tokenInfo.mcapUsd ?? 0) > 0 ? "text-brand" : "text-muted"}`}>
                      {(tokenInfo.mcapUsd ?? 0) > 0 ? formatMcap(tokenInfo.mcapUsd) : "unavailable"}
                    </span>
                  </div>
                )}

                {/* Min range */}
                <div>
                  <label className="block text-xs text-muted mb-1.5">Min range (USD) — start of lowest outcome</label>
                  <input
                    type="number" step="any" min="0"
                    value={mcapMinInput}
                    onChange={e => setMcapMinInput(e.target.value)}
                    placeholder="e.g. 100000"
                    className="w-full px-3 py-2 rounded-lg bg-surface border border-surface-3 text-white text-sm font-mono focus:outline-none focus:border-brand transition-colors"
                  />
                  {mcapMinInput && parseFloat(mcapMinInput) > 0 && (
                    <p className="text-[10px] text-brand/70 mt-0.5 font-mono">{formatMcap(parseFloat(mcapMinInput))}</p>
                  )}
                </div>

                {/* Max range */}
                <div>
                  <label className="block text-xs text-muted mb-1.5">Max range (USD) — end of highest outcome</label>
                  <input
                    type="number" step="any" min="0"
                    value={mcapMaxInput}
                    onChange={e => setMcapMaxInput(e.target.value)}
                    placeholder="e.g. 10000000"
                    className="w-full px-3 py-2 rounded-lg bg-surface border border-surface-3 text-white text-sm font-mono focus:outline-none focus:border-brand transition-colors"
                  />
                  {mcapMaxInput && parseFloat(mcapMaxInput) > 0 && (
                    <p className="text-[10px] text-brand/70 mt-0.5 font-mono">{formatMcap(parseFloat(mcapMaxInput))}</p>
                  )}
                </div>

                {/* Scale type */}
                <div>
                  <label className="block text-xs text-muted mb-1.5">Scale</label>
                  <div className="flex gap-2">
                    {(["logarithmic","linear"] as const).map(s => (
                      <button key={s} onClick={() => setMcapScaleType(s)}
                        className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors
                          ${mcapScaleType === s
                            ? "bg-brand/20 border-brand/40 text-brand"
                            : "bg-surface border-surface-3 text-muted hover:text-white"}`}>
                        {s === "logarithmic" ? "Logarithmic (rec.)" : "Linear"}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted mt-1">
                    {mcapScaleType === "logarithmic"
                      ? "Equal percentage steps — best for volatile tokens with wide mcap ranges."
                      : "Equal dollar steps — best for stable or predictable assets."}
                  </p>
                </div>

                {/* Number of ranges */}
                <div>
                  <label className="block text-xs text-muted mb-1.5">Number of ranges</label>
                  <div className="flex gap-1.5">
                    {[2,3,4,5,6].map(n => (
                      <button key={n} onClick={() => setMcapNumRanges(n)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors
                          ${mcapNumRanges === n
                            ? "bg-brand/20 border-brand/40 text-brand"
                            : "bg-surface border-surface-3 text-muted hover:text-white"}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Live outcome preview ── */}
            <div className="space-y-1.5">
              <p className="text-xs text-muted uppercase tracking-wider mb-2">Live preview</p>
              {outcomes.map((o, i) => {
                const colors = ["#f87171","#fb923c","#facc15","#4ade80","#38bdf8","#c084fc"];
                const fmtBound = (v: number | null | undefined, open: "min" | "max") => {
                  if (v == null) return open === "min" ? "—" : "∞";
                  return cryptoQType === "price" && tokenInfo
                    ? fmtPrice(v, tokenInfo.priceUsd)
                    : formatMcap(v);
                };
                return (
                  <div key={o.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-surface-2 border border-surface-3">
                    <span className="w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center shrink-0 text-black"
                      style={{ backgroundColor: colors[i] }}>{o.id}</span>
                    <span className="flex-1 text-white text-xs">{o.label || "—"}</span>
                    {(o.minPrice != null || o.maxPrice != null) && (
                      <span className="text-[10px] font-mono text-muted shrink-0">
                        {fmtBound(o.minPrice, "min")} → {fmtBound(o.maxPrice, "max")}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

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
            question={question} description={description} outcomes={outcomes}
            betDuration={betDuration} uploadedImage={uploadedImage}
            username={user.username} tokenInfo={tokenInfo}
            cryptoQType={cryptoQType} isPumpFun={isPumpFun}
            creating={creating} createError={createError}
            onBack={() => setStep(3)} onCreate={handleCreate}
          />
        )}

        {/* ══ TWITTER FLOW ═════════════════════════════════════════════ */}

        {/* Twitter Step 1: Account */}
        {category === "twitter" && step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-white font-semibold mb-1">Twitter Account</h2>
              <p className="text-muted text-xs mb-3">Enter a public Twitter/X username to track.</p>
              <input type="text" placeholder="@elonmusk" value={twitterQuery}
                onChange={e => setTwitterQuery(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-surface-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-[#1d9bf0] transition-colors font-mono" />
              {twitterQuery.trim() && !validTwitterUsername(twitterQuery) && (
                <p className="text-red-400 text-xs mt-1.5">Invalid username — only letters, numbers, underscores (max 15 chars)</p>
              )}
            </div>

            {validTwitterUsername(twitterQuery) && cleanTwitter && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-surface-2 border border-[#1d9bf0]/30">
                {twitterAvatarUrl && !avatarError ? (
                  <img src={twitterAvatarUrl} alt={cleanTwitter}
                    className="w-12 h-12 rounded-full shrink-0 object-cover"
                    onError={() => setAvatarError(true)} />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-[#1d9bf0] flex items-center justify-center shrink-0">
                    <span className="text-white font-bold text-xl leading-none">{cleanTwitter[0]?.toUpperCase() ?? "?"}</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[#1d9bf0] text-sm font-mono font-semibold">@{cleanTwitter}</p>
                  <a href={`https://twitter.com/${cleanTwitter}`} target="_blank" rel="noopener noreferrer"
                    className="text-white/40 text-xs hover:text-[#1d9bf0] transition-colors">View on X →</a>
                </div>
                <span className="text-[10px] text-yellow-400/80 bg-yellow-400/10 border border-yellow-400/20 px-2 py-0.5 rounded shrink-0">
                  Must be public
                </span>
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
              <p className="text-muted text-xs mb-4">What do you want to predict about @{cleanTwitter}?</p>
            </div>
            <div className="space-y-3">
              {([
                { value: "posts_count"    as const, label: "Post count in 24h",
                  desc: `How many posts will @${cleanTwitter} make in the next 24h?`, icon: "📊" },
                { value: "next_post_time" as const, label: "Time until next post",
                  desc: `When will @${cleanTwitter} make their next post?`, icon: "⏱" },
              ]).map(opt => (
                <button key={opt.value} onClick={() => setTwitterQuestion(opt.value)}
                  className={`w-full flex items-start gap-3 p-4 rounded-xl border text-left transition-all
                    ${twitterQuestion === opt.value ? "border-brand/50 bg-brand/5" : "border-white/10 bg-surface-2 hover:border-white/20"}`}>
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
                className="px-4 py-2 rounded-lg bg-brand hover:bg-brand-dim text-black font-semibold text-sm transition-colors">Next →</button>
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
                className="px-4 py-2 rounded-lg bg-brand hover:bg-brand-dim text-black font-semibold text-sm transition-colors disabled:opacity-40">Next →</button>
            </div>
          </div>
        )}

        {/* Twitter Step 4: Details + Review */}
        {category === "twitter" && step === 4 && (
          <div className="space-y-4">
            <h2 className="text-white font-semibold">Details &amp; Review</h2>
            <div>
              <label className="block text-xs text-muted mb-2">Duration</label>
              <div className="flex gap-2">
                {TWITTER_DURATIONS.map(d => (
                  <button key={d.value} onClick={() => setTwitterDuration(d.value)}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors
                      ${twitterDuration === d.value ? "bg-brand/10 border-brand/40 text-brand" : "bg-surface-2 border-surface-3 text-muted hover:text-white"}`}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Description <span className="text-white/30">(optional)</span></label>
              <textarea maxLength={500} rows={2} placeholder="Add resolution criteria or context…"
                value={description} onChange={e => setDescription(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-surface-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-brand transition-colors resize-none" />
            </div>
            <div className="rounded-xl border border-white/8 bg-[#0d0f14] overflow-hidden">
              <div className="flex items-center gap-3 p-4">
                {twitterAvatarUrl && !avatarError ? (
                  <img src={twitterAvatarUrl} alt={cleanTwitter} className="w-10 h-10 rounded-full shrink-0 object-cover"
                    onError={() => setAvatarError(true)} />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-[#1d9bf0] flex items-center justify-center shrink-0">
                    <span className="text-white font-bold text-base leading-none">{cleanTwitter[0]?.toUpperCase() ?? "?"}</span>
                  </div>
                )}
                <div>
                  <p className="text-white font-semibold text-sm">@{cleanTwitter}</p>
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
                <span>{TWITTER_DURATIONS.find(d => d.value === twitterDuration)?.label} · {outcomes.length} outcomes</span>
              </div>
            </div>
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

// ── Crypto review step ────────────────────────────────────────────────────────

const QTYPE_LABELS: Record<string, string> = {
  price:    "📈 Price",
  ath_mcap: "🏆 ATH Market Cap",
  mcap:     "💰 End Market Cap",
};

function ReviewStep({
  question, description, outcomes, betDuration, uploadedImage, username, tokenInfo,
  cryptoQType, isPumpFun, creating, createError, onBack, onCreate,
}: {
  question: string; description: string; outcomes: OutcomeInput[];
  betDuration: number; uploadedImage: string; username: string;
  tokenInfo: TokenInfo | null; cryptoQType: CryptoQType; isPumpFun: boolean;
  creating: boolean; createError: string; onBack: () => void; onCreate: () => void;
}) {
  const tfLabel      = formatDuration(betDuration);
  const resultBuffer = betDuration <= 3 ? 2 : 5;

  return (
    <div className="space-y-4">
      <h2 className="text-white font-semibold">Review &amp; Create</h2>
      <div className="rounded-xl border border-surface-3 bg-surface overflow-hidden">
        <div className="p-4">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border bg-purple-500/10 text-purple-400 border-purple-500/20">Community</span>
            <span className="text-[10px] px-2 py-0.5 rounded border bg-white/5 text-white/40 border-white/10">{QTYPE_LABELS[cryptoQType]}</span>
            {tokenInfo && (
              <div className="flex items-center gap-1.5">
                {tokenInfo.logoUrl && <img src={tokenInfo.logoUrl} alt={tokenInfo.symbol} className="w-4 h-4 rounded-full" />}
                <span className="text-[10px] text-muted font-mono">{tokenInfo.symbol}</span>
                {isPumpFun && (
                  <span className="bg-orange-500/20 text-orange-400 border border-orange-500/30 text-[10px] px-2 py-0.5 rounded-full">pump.fun</span>
                )}
              </div>
            )}
            <span className="ml-auto text-[10px] text-muted">{tfLabel} betting</span>
          </div>
          <div className="flex items-start gap-3 mb-3">
            {uploadedImage && (
              <img src={uploadedImage} alt="Market" className="w-20 h-20 rounded-lg object-cover shrink-0" />
            )}
            <p className="text-white text-sm font-medium leading-snug pt-0.5">{question}</p>
          </div>
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
          <span>{outcomes.length} outcomes · result +{resultBuffer}min after close</span>
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
