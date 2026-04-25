"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/lib/useAuth";

const OUTCOME_IDS = ["A", "B", "C", "D", "E", "F"];
const DURATIONS = [
  { label: "15 min",  value: 15 },
  { label: "1 hour",  value: 60 },
  { label: "4 hours", value: 240 },
  { label: "24 hours",value: 1440 },
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

interface OutcomeInput {
  id: string;
  label: string;
}

const STEP_LABELS = ["Token", "Details", "Outcomes", "Review"];

export default function CreatePage() {
  const router = useRouter();
  const { user, getToken } = useAuth();

  const [step, setStep] = useState(1);

  // Step 1 — token
  const [tokenQuery, setTokenQuery]   = useState("");
  const [tokenInfo,  setTokenInfo]    = useState<TokenInfo | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenError, setTokenError]   = useState("");

  // Step 2 — details
  const [question,    setQuestion]    = useState("");
  const [description, setDescription] = useState("");
  const [twitterUrl,  setTwitterUrl]  = useState("");
  const [customImage, setCustomImage] = useState("");
  const [duration,    setDuration]    = useState(60);

  // Step 3 — outcomes
  const [outcomes, setOutcomes] = useState<OutcomeInput[]>([
    { id: "A", label: "" },
    { id: "B", label: "" },
  ]);

  // Step 4 — submit
  const [creating,     setCreating]     = useState(false);
  const [createError,  setCreateError]  = useState("");

  // Token lookup with 500 ms debounce
  const lookupToken = useCallback(async (q: string) => {
    if (!q.trim()) { setTokenInfo(null); return; }
    setTokenLoading(true);
    setTokenError("");
    try {
      const res = await fetch(`/api/markets/token-lookup?address=${encodeURIComponent(q.trim())}`);
      if (!res.ok) {
        setTokenError((await res.json()).error ?? "Token not found");
        setTokenInfo(null);
      } else {
        setTokenInfo(await res.json());
      }
    } catch {
      setTokenError("Lookup failed");
      setTokenInfo(null);
    } finally {
      setTokenLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!tokenQuery.trim()) { setTokenInfo(null); setTokenError(""); return; }
    const id = setTimeout(() => lookupToken(tokenQuery), 500);
    return () => clearTimeout(id);
  }, [tokenQuery, lookupToken]);

  function addOutcome() {
    if (outcomes.length >= 6) return;
    setOutcomes(prev => [...prev, { id: OUTCOME_IDS[prev.length], label: "" }]);
  }

  function removeOutcome(idx: number) {
    if (outcomes.length <= 2) return;
    setOutcomes(prev =>
      prev.filter((_, i) => i !== idx).map((o, i) => ({ ...o, id: OUTCOME_IDS[i] }))
    );
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

  async function handleCreate() {
    setCreating(true);
    setCreateError("");
    try {
      const token = getToken();
      const res = await fetch("/api/markets/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          tokenAddress: tokenInfo?.address && tokenInfo.address !== tokenInfo.symbol
            ? tokenInfo.address : null,
          question,
          outcomes,
          duration,
          description,
          twitterUrl,
          customImage,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      router.push(`/rounds/${data.id}`);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create market");
      setCreating(false);
    }
  }

  // Validation per step
  const step2Valid = question.trim().length >= 5 && question.trim().length <= 100;
  const step3Valid = outcomes.every(o => o.label.trim().length > 0);

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
        <div className="flex items-center gap-2 mb-8">
          {STEP_LABELS.map((label, i) => {
            const n = i + 1;
            const active = n === step;
            const done   = n < step;
            return (
              <div key={n} className="flex items-center gap-2 flex-1">
                <div className={`flex items-center gap-1.5 ${n < STEP_LABELS.length ? "flex-1" : ""}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 transition-colors
                    ${active ? "bg-brand text-black" : done ? "bg-brand/30 text-brand" : "bg-surface-3 text-muted"}`}>
                    {done ? "✓" : n}
                  </div>
                  <span className={`text-xs ${active ? "text-white" : "text-muted"}`}>{label}</span>
                </div>
                {n < STEP_LABELS.length && <div className={`flex-1 h-px ${done ? "bg-brand/40" : "bg-surface-3"}`} />}
              </div>
            );
          })}
        </div>

        {/* ── Step 1: Token ─────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-white font-semibold mb-1">Token <span className="text-muted font-normal">(optional)</span></h2>
              <p className="text-muted text-xs mb-3">Paste a Solana contract address or type a symbol like BTC, SOL, ETH.</p>
              <input
                type="text"
                placeholder="e.g. BTC or EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
                value={tokenQuery}
                onChange={e => setTokenQuery(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-surface-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-brand transition-colors font-mono"
              />
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
                <button onClick={() => { setTokenQuery(""); setTokenInfo(null); }} className="text-muted hover:text-white text-xs transition-colors">✕</button>
              </div>
            )}

            <div className="flex justify-between pt-2">
              <span className="text-muted text-xs">Token is optional — you can create any market.</span>
              <button onClick={() => setStep(2)}
                className="px-4 py-2 rounded-lg bg-brand hover:bg-brand-dim text-black font-semibold text-sm transition-colors">
                Next →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Details ───────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-white font-semibold mb-3">Market Details</h2>

              <label className="block text-xs text-muted mb-1">Question <span className="text-red-400">*</span></label>
              <input
                type="text"
                maxLength={100}
                placeholder="Will BTC close above $100k this week?"
                value={question}
                onChange={e => setQuestion(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-surface-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-brand transition-colors"
              />
              <p className="text-muted text-[10px] mt-1 text-right">{question.length}/100</p>
            </div>

            <div>
              <label className="block text-xs text-muted mb-1">Description <span className="text-white/30">(optional)</span></label>
              <textarea
                maxLength={500}
                rows={3}
                placeholder="Add context, rules, or resolution criteria…"
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-surface-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-brand transition-colors resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted mb-1">Twitter / X link <span className="text-white/30">(optional)</span></label>
                <input
                  type="url"
                  placeholder="https://x.com/..."
                  value={twitterUrl}
                  onChange={e => setTwitterUrl(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-surface-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-brand transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Image URL <span className="text-white/30">(optional)</span></label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={customImage}
                  onChange={e => setCustomImage(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-surface-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-brand transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-muted mb-2">Duration</label>
              <div className="flex gap-2">
                {DURATIONS.map(d => (
                  <button key={d.value} onClick={() => setDuration(d.value)}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors
                      ${duration === d.value
                        ? "bg-brand/10 border-brand/40 text-brand"
                        : "bg-surface-2 border-surface-3 text-muted hover:text-white"}`}>
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

        {/* ── Step 3: Outcomes ──────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-semibold">Outcomes</h2>
              {tokenInfo?.priceUsd && (
                <button onClick={autoGenerateOutcomes}
                  className="text-xs text-brand hover:text-brand-dim transition-colors flex items-center gap-1">
                  ✦ Auto-generate from price
                </button>
              )}
            </div>
            <p className="text-muted text-xs">Add 2–6 outcomes. Each outcome gets a letter label (A–F).</p>

            <div className="space-y-2">
              {outcomes.map((o, idx) => (
                <div key={o.id} className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded flex items-center justify-center text-[10px] font-bold bg-surface-3 text-muted shrink-0">{o.id}</span>
                  <input
                    type="text"
                    maxLength={80}
                    placeholder={`Outcome ${o.id} label…`}
                    value={o.label}
                    onChange={e => setOutcomes(prev => prev.map((x, i) => i === idx ? { ...x, label: e.target.value } : x))}
                    className="flex-1 px-3 py-2 rounded-lg bg-surface-2 border border-surface-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-brand transition-colors"
                  />
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

        {/* ── Step 4: Review ────────────────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-white font-semibold">Review & Create</h2>

            {/* Preview card */}
            <div className="rounded-xl border border-surface-3 bg-surface overflow-hidden">
              {customImage && (
                <img src={customImage} alt="Market" className="w-full h-28 object-cover" />
              )}
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
                <span>Created by <span className="text-white">{user.username}</span></span>
                <span>{outcomes.length} outcomes · LMSR</span>
              </div>
            </div>

            {/* Cost */}
            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-surface-2 border border-surface-3 text-sm">
              <span className="text-muted">Creation fee</span>
              <span className="font-mono font-bold text-white">10 DORA</span>
            </div>

            {createError && (
              <p className="text-red-400 text-sm px-1">{createError}</p>
            )}

            <div className="flex justify-between pt-1">
              <button onClick={() => setStep(3)} disabled={creating}
                className="px-4 py-2 rounded-lg bg-surface-2 border border-surface-3 text-muted hover:text-white text-sm transition-colors disabled:opacity-40">
                ← Back
              </button>
              <button onClick={handleCreate} disabled={creating}
                className="px-6 py-2.5 rounded-lg bg-brand hover:bg-brand-dim text-black font-bold text-sm transition-colors disabled:opacity-40 flex items-center gap-2">
                {creating && (
                  <svg className="animate-spin w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                  </svg>
                )}
                {creating ? "Creating…" : "Create Market (10 DORA)"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
