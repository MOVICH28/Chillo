"use client";

import { useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

interface FAQItem {
  question: string;
  answer: string | React.ReactNode;
}

interface FAQSection {
  title: string;
  icon: string;
  items: FAQItem[];
}

const FAQ_SECTIONS: FAQSection[] = [
  {
    title: "How It Works",
    icon: "💡",
    items: [
      {
        question: "What is Pumpdora?",
        answer:
          "Pumpdora is a prediction platform on Solana where you predict the price of BTC or SOL in the next 15 minutes. Pick the right price range — win a share of the prize pool!",
      },
      {
        question: "How does a round work?",
        answer: (
          <ol className="list-decimal list-inside space-y-1.5 text-muted">
            <li>A new round opens every 10 minutes</li>
            <li>You see 6 price ranges — pick where you think the price will be in 15 minutes</li>
            <li>You have 10 minutes to place your bet</li>
            <li>After 15 minutes the result is announced using the live Binance price</li>
            <li>Winners split the prize pool proportionally to their bet size</li>
          </ol>
        ),
      },
      {
        question: "Are there two separate rounds — BTC and SOL?",
        answer:
          "Yes! There is always one active BTC round and one active SOL round running simultaneously. You can bet on both at the same time.",
      },
      {
        question: "How are results determined?",
        answer:
          "We use the real-time price from Binance at the exact moment the round ends. Whichever of the 6 price ranges contains that price is the winner.",
      },
    ],
  },
  {
    title: "Payouts & Fees",
    icon: "💸",
    items: [
      {
        question: "How much can I win?",
        answer: (
          <div className="space-y-2 text-muted">
            <p>It depends on how many people bet on the same range as you. If few people picked your range but you were right — you win big. If many people picked your range — you share the pot with more people.</p>
            <code className="block bg-surface-2 border border-surface-3 rounded-lg px-3 py-2 text-brand font-mono text-xs">
              payout = (your bet / total bets on winning range) × 95% of total pool
            </code>
          </div>
        ),
      },
      {
        question: "What is the platform fee?",
        answer:
          "Pumpdora takes 5% from each round's pool. 95% goes to winners.",
      },
      {
        question: "When do I receive my winnings?",
        answer:
          "Winnings are sent automatically to your wallet right after the round resolves — usually within seconds. You can track your bet status in your Profile page.",
      },
      {
        question: "What if nobody bets on the winning range?",
        answer:
          "If no one picks the correct range, all bets are refunded to everyone — no fee charged.",
      },
    ],
  },
  {
    title: "Betting Rules",
    icon: "🎯",
    items: [
      {
        question: "What is the minimum bet?",
        answer: "The minimum bet is 0.05 SOL.",
      },
      {
        question: "Can I bet on multiple ranges in one round?",
        answer:
          "No, you can only place one bet per round per token (BTC or SOL). Choose your range carefully!",
      },
    ],
  },
  {
    title: "Wallet & Security",
    icon: "🔐",
    items: [
      {
        question: "What wallet do I need?",
        answer: (
          <div className="space-y-2 text-muted">
            <p>You need a Phantom or Solflare wallet with some SOL.</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><span className="text-white">Phantom</span> — download free at <a href="https://phantom.app" target="_blank" rel="noreferrer" className="text-brand hover:underline">phantom.app</a> — takes 2 minutes to set up</li>
              <li><span className="text-white">Solflare</span> — available at <a href="https://solflare.com" target="_blank" rel="noreferrer" className="text-brand hover:underline">solflare.com</a></li>
            </ul>
            <p>Make sure to switch your wallet to <span className="text-yellow-400">Devnet</span> and get free devnet SOL from the <a href="https://faucet.solana.com" target="_blank" rel="noreferrer" className="text-brand hover:underline">Solana faucet</a>.</p>
          </div>
        ),
      },
      {
        question: "Is it safe?",
        answer:
          "Your SOL is held in a platform wallet during the round and sent back automatically when resolved. We never ask for your seed phrase or private keys. All interactions are standard Solana transactions that you sign in your own wallet.",
      },
    ],
  },
];

function AccordionItem({ item, isOpen, onToggle }: {
  item: FAQItem;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-surface-3 last:border-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-surface-2/50 transition-colors"
      >
        <span className={`text-sm font-medium transition-colors ${isOpen ? "text-brand" : "text-white"}`}>
          {item.question}
        </span>
        <span className={`shrink-0 text-muted transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </span>
      </button>
      {isOpen && (
        <div className="px-5 pb-5 text-sm text-muted leading-relaxed">
          {item.answer}
        </div>
      )}
    </div>
  );
}

export default function FAQPage() {
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});

  function toggle(key: string) {
    setOpenItems(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleSection(sectionIdx: number, section: FAQSection) {
    const allOpen = section.items.every((_, i) => openItems[`${sectionIdx}-${i}`]);
    const next: Record<string, boolean> = { ...openItems };
    section.items.forEach((_, i) => {
      next[`${sectionIdx}-${i}`] = !allOpen;
    });
    setOpenItems(next);
  }

  return (
    <div className="min-h-screen bg-base pt-16">
      <Navbar rounds={[]} />
      <div className="max-w-3xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-brand rounded-lg flex items-center justify-center text-black font-bold text-sm shrink-0">
              P
            </div>
            <div>
              <h1 className="text-white font-bold text-2xl leading-tight">
                Pumpdor<span className="text-brand">a</span> FAQ
              </h1>
              <p className="text-muted text-xs mt-0.5">Everything you need to know</p>
            </div>
          </div>
          <Link
            href="/"
            className="text-muted text-sm hover:text-white transition-colors shrink-0"
          >
            ← Markets
          </Link>
        </div>

        {/* Sections */}
        <div className="space-y-6">
          {FAQ_SECTIONS.map((section, si) => (
            <div key={section.title} className="bg-surface border border-surface-3 rounded-xl overflow-hidden">
              {/* Section header */}
              <button
                onClick={() => toggleSection(si, section)}
                className="w-full flex items-center gap-2.5 px-5 py-3.5 border-b border-surface-3 bg-surface-2/30 hover:bg-surface-2/60 transition-colors text-left"
              >
                <span className="text-base leading-none">{section.icon}</span>
                <h2 className="text-white font-semibold text-sm tracking-wide flex-1">{section.title}</h2>
                <span className="text-[10px] uppercase tracking-widest text-muted">
                  {section.items.length} questions
                </span>
              </button>

              {/* Items */}
              {section.items.map((item, ii) => (
                <AccordionItem
                  key={ii}
                  item={item}
                  isOpen={!!openItems[`${si}-${ii}`]}
                  onToggle={() => toggle(`${si}-${ii}`)}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Footer note */}
        <p className="text-center text-muted text-xs mt-10">
          Still have questions?{" "}
          <a
            href="https://github.com/MOVICH28/Pumpdora/issues"
            target="_blank"
            rel="noreferrer"
            className="text-brand hover:underline"
          >
            Open an issue on GitHub
          </a>
        </p>

      </div>
    </div>
  );
}
