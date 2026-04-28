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
    title: "What is Pumpdora?",
    icon: "🎯",
    items: [
      {
        question: "What is Pumpdora?",
        answer:
          "Pumpdora is a virtual prediction market platform for testing trading strategies. You predict outcomes of crypto price movements, Twitter account activity, and custom events using DORA — a virtual currency. Everything is simulated: no real money, no real crypto wallets required.",
      },
      {
        question: "What is DORA?",
        answer: (
          <div className="space-y-2 text-muted">
            <p>DORA is the virtual currency used on Pumpdora. It has no real monetary value — it exists purely to simulate trading on prediction markets.</p>
            <p>Every new account receives <span className="text-brand font-semibold">1000 DORA for free</span> on registration. You can use it to trade, create markets, and climb the leaderboard.</p>
          </div>
        ),
      },
      {
        question: "Is real money involved?",
        answer:
          "No. Pumpdora is a testnet/simulation platform. DORA is not real money and cannot be withdrawn or converted. The platform runs on Solana devnet — all transactions are simulated. Think of it as a trading simulator.",
      },
      {
        question: "How do I get started?",
        answer: (
          <div className="space-y-2 text-muted">
            <p>Click <span className="text-white font-semibold">Login / Register</span> in the top right. You can register with an email, username, and password — or use Google login.</p>
            <p>You instantly receive <span className="text-brand font-semibold">1000 DORA</span> to start trading. No wallet setup, no credit card needed.</p>
          </div>
        ),
      },
    ],
  },
  {
    title: "How LMSR Trading Works",
    icon: "📈",
    items: [
      {
        question: "What is LMSR?",
        answer: (
          <div className="space-y-2 text-muted">
            <p>LMSR (Logarithmic Market Scoring Rule) is an automated market maker used in prediction markets. Unlike traditional betting where you split a fixed pool, LMSR uses a mathematical formula to continuously price outcome shares.</p>
            <p>This means you can <span className="text-white">buy and sell shares at any time</span> before betting closes — not just at the start. Prices adjust dynamically with demand.</p>
          </div>
        ),
      },
      {
        question: "How do I trade?",
        answer: (
          <ol className="list-decimal list-inside space-y-1.5 text-muted">
            <li>Open any market and pick an outcome (A, B, C…)</li>
            <li>Enter a DORA amount and click Buy — you receive shares at the current price</li>
            <li>If your outcome wins, each share pays out proportionally from the losers&apos; pool</li>
            <li>You can also Sell your shares back before betting closes to lock in a profit or cut a loss</li>
          </ol>
        ),
      },
      {
        question: "How are prices determined?",
        answer:
          "Each outcome starts at an equal probability (e.g. 25% each for 4 outcomes). As traders buy shares in an outcome, its price rises and others fall. The price of an outcome reflects the market's implied probability that it will win. An outcome priced at 0.70 DORA per share means the market implies ~70% chance it wins.",
      },
      {
        question: "What is the trading fee?",
        answer:
          "There is a 1% platform fee on every trade — both buys and sells. The fee is deducted from your DORA amount before shares are issued (on buy) or from proceeds (on sell). Market creators also earn 1% of every trade in their market as a commission.",
      },
      {
        question: "What happens when I sell?",
        answer:
          "You can sell some or all of your shares back to the market at the current LMSR price at any time before betting closes. Selling is useful if the market has moved in your favour and you want to lock in profit, or if you want to cut a loss before resolution.",
      },
    ],
  },
  {
    title: "Markets & Outcomes",
    icon: "🏪",
    items: [
      {
        question: "What types of markets are there?",
        answer: (
          <div className="space-y-2 text-muted">
            <p><span className="text-white font-semibold">Crypto markets</span> — Questions about token price, market cap, or all-time high. Results are resolved automatically at round end using live price data.</p>
            <p><span className="text-white font-semibold">Twitter / X markets</span> — Questions about a Twitter account&apos;s follower count or posting frequency. These are resolved manually.</p>
            <p><span className="text-white font-semibold">pump.fun markets</span> — Markets for pump.fun tokens, including price and market cap questions.</p>
          </div>
        ),
      },
      {
        question: "What do the outcome labels A, B, C… mean?",
        answer:
          "Each market has 2 to 6 outcomes labeled A through F. Each label maps to a specific answer (e.g. A = price below $50K, B = $50K–$60K, C = above $60K). The full label is shown on the market card and in the bet panel.",
      },
      {
        question: "How are results determined?",
        answer: (
          <div className="space-y-2 text-muted">
            <p><span className="text-white font-semibold">Crypto markets:</span> Automatically resolved at round end. The outcome whose range contains the live price (from Binance or a DEX) at the exact end time wins.</p>
            <p><span className="text-white font-semibold">Twitter markets:</span> Resolved manually by admins after verifying the data against the Twitter API.</p>
          </div>
        ),
      },
    ],
  },
  {
    title: "Creating Markets",
    icon: "🛠️",
    items: [
      {
        question: "How do I create a market?",
        answer: (
          <ol className="list-decimal list-inside space-y-1.5 text-muted">
            <li>Click <span className="text-white font-semibold">+ Create</span> in the navbar (you must be logged in)</li>
            <li>Enter a question and define 2–6 outcome labels</li>
            <li>Choose a category (Crypto or Twitter) and set the betting duration</li>
            <li>Pay 10 DORA creation fee — the market opens immediately</li>
          </ol>
        ),
      },
      {
        question: "What is the creation fee and daily limit?",
        answer:
          "Creating a market costs 10 DORA. Regular accounts can create up to 2 markets per day. Admin accounts can create up to 20 per day.",
      },
      {
        question: "Do I earn anything from my market?",
        answer:
          "Yes — as the creator you earn a 1% commission on every trade placed in your market (buys and sells). This is separate from the platform fee and is credited to your DORA balance automatically.",
      },
      {
        question: "What options are available when creating a market?",
        answer: (
          <div className="space-y-2 text-muted">
            <p>For crypto markets you can link a token by contract address (auto-fetches name and logo), choose the question type (price / market cap / ATH), and set a separate betting close time before the result time.</p>
            <p>For Twitter markets you link a Twitter username and choose between follower count or posting frequency as the question type.</p>
            <p>All markets support an optional description and a Twitter/X reference link for additional context.</p>
          </div>
        ),
      },
    ],
  },
  {
    title: "Payouts & Balance",
    icon: "💸",
    items: [
      {
        question: "How are winnings calculated?",
        answer: (
          <div className="space-y-2 text-muted">
            <p>When a market resolves, shares in the winning outcome are worth a payout determined by the LMSR model. Losing shares expire worthless.</p>
            <p>Your payout = (your shares) × (payout per share). The payout per share depends on how many shares were bought and at what prices — higher-probability outcomes pay less per share but are safer bets.</p>
          </div>
        ),
      },
      {
        question: "When are winnings credited?",
        answer:
          "Winnings are added to your DORA balance automatically within seconds of a market resolving. You can track all your bets, results, and P&L in your Profile page.",
      },
      {
        question: "What happens if a market is refunded?",
        answer:
          "If a market cannot be resolved (e.g. data unavailable), all bets are refunded in full. Refunded bets appear in your trading history with a REFUND status.",
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
          <Link href="/" className="text-muted text-sm hover:text-white transition-colors shrink-0">
            ← Markets
          </Link>
        </div>

        {/* Sections */}
        <div className="space-y-6">
          {FAQ_SECTIONS.map((section, si) => (
            <div key={section.title} className="bg-surface border border-surface-3 rounded-xl overflow-hidden">
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
