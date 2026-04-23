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
          "Pumpdora is a prediction platform where you predict the price of BTC or SOL in the next 15 minutes using DORA virtual currency. Pick the right price range — win a share of the prize pool!",
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
          "Yes! There is always one active BTC round and one active SOL price round running simultaneously. You can bet on both at the same time.",
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
            <p>Your winnings depend on two things: how many people bet on the same range as you, and how much total DORA was bet on losing ranges. Here is how it works — all bets from losing ranges go into the prize pool and get distributed to winners. If you bet on the correct range, you receive your original bet back plus a share of the losers pool proportional to your stake.</p>
            <p><span className="text-white font-semibold">Example:</span> total pool is 100 DORA, winning range collected 20 DORA, you bet 10 DORA on the winning range — you get (10/20) × 95 DORA = <span className="text-brand font-semibold">47.5 DORA</span>.</p>
            <p>The fewer people on your range and the more people on wrong ranges, the bigger your reward.</p>
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
          "Winnings are added to your DORA balance automatically right after the round resolves — usually within seconds. You can track your bet status in your Profile page.",
      },
    ],
  },
  {
    title: "Betting Rules",
    icon: "🎯",
    items: [
      {
        question: "What is the minimum bet?",
        answer: "The minimum bet is 1 DORA.",
      },
      {
        question: "Can I bet on multiple ranges in one round?",
        answer:
          "Yes! You can bet on as many ranges as you want in a single round. You can also place multiple bets on the same range to increase your stake. The more you bet on the correct range, the bigger your share of the prize pool.",
      },
    ],
  },
  {
    title: "Account & Security",
    icon: "🔐",
    items: [
      {
        question: "How do I get started?",
        answer: (
          <div className="space-y-2 text-muted">
            <p>Simply click <span className="text-white font-semibold">Login / Register</span> in the top right. Create a free account with a username, email, and password.</p>
            <p>You start with <span className="text-brand font-semibold">1000 DORA</span> virtual currency — no real money, no wallet needed.</p>
          </div>
        ),
      },
      {
        question: "Is it safe?",
        answer:
          "Pumpdora uses DORA virtual currency — no real money or crypto wallets are involved. Your account is protected by bcrypt-hashed passwords and JWT authentication.",
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
