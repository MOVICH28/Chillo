"use client";

import { useState } from "react";
import Link from "next/link";

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
        question: "What is Chillo?",
        answer:
          "Chillo is a decentralized prediction market on the Solana blockchain. You bet SOL on YES or NO outcomes for crypto-related questions — like whether Bitcoin will hit a price target or whether Solana will outperform. Winners share the entire pool; the platform takes a small 5% fee.",
      },
      {
        question: "How do I place a bet?",
        answer: (
          <ol className="list-decimal list-inside space-y-1.5 text-muted">
            <li>Connect your Solana wallet (Phantom or Backpack)</li>
            <li>Make sure you have SOL on Solana devnet (<a href="https://faucet.solana.com" target="_blank" rel="noreferrer" className="text-brand hover:underline">get devnet SOL here</a>)</li>
            <li>Pick an open market and choose YES or NO</li>
            <li>Enter your bet amount and confirm the transaction in your wallet</li>
            <li>Your bet is registered once the on-chain transaction is verified</li>
          </ol>
        ),
      },
      {
        question: "What is YES/NO betting?",
        answer:
          "Every market is a binary question with a YES or NO outcome. For example: \"Will BTC be above $100,000 by end of day?\" — you either believe YES (it will) or NO (it won't). When the market resolves, one side wins and the other loses.",
      },
      {
        question: "How are odds calculated?",
        answer:
          "Odds are parimutuel — they update in real time based on how much SOL is in each pool. If most people bet YES, YES odds get lower (smaller payout per SOL) and NO odds get higher (bigger payout per SOL). Your displayed odds at the time of betting are indicative; final payout is determined by the pool at resolution.",
      },
      {
        question: "When do rounds end?",
        answer:
          "Each round has an end time shown on the market card. After the end time passes, no new bets are accepted. Chillo then checks the real-world result and resolves the round automatically, sending payouts to winners.",
      },
    ],
  },
  {
    title: "Payouts",
    icon: "💸",
    items: [
      {
        question: "How are winnings calculated?",
        answer: (
          <div className="space-y-2 text-muted">
            <p>Your payout is proportional to your share of the winning pool:</p>
            <code className="block bg-surface-2 border border-surface-3 rounded-lg px-3 py-2 text-brand font-mono text-xs">
              payout = (your_bet / total_winning_bets) × total_pool × 0.95
            </code>
            <p>The <span className="text-white">0.95</span> factor reflects the 5% platform fee deducted from the total pool before distribution.</p>
          </div>
        ),
      },
      {
        question: "When do I receive my payout?",
        answer:
          "Payouts are sent automatically when a round ends. Our system checks results once daily at midnight UTC and immediately sends SOL to all winning wallets. You will see the SOL in your Phantom wallet within seconds after resolution. You can also track your bet status in your Profile page.",
      },
      {
        question: "What is the platform fee?",
        answer:
          "Chillo takes a 5% fee from the total pool at resolution. This fee is only taken when there is a genuine contest between YES and NO sides. If everyone bet on the same side, 0% fee is charged and all bets are fully refunded.",
      },
      {
        question: "What happens if everyone bets on one side?",
        answer: (
          <div className="space-y-2 text-muted">
            <p>If all bets are on the same side (e.g. everyone bet YES), there is no pool to pay out from. In this case:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><span className="text-white font-semibold">100% of your bet is refunded</span> — no platform fee</li>
              <li>The transaction is sent on-chain back to your wallet</li>
              <li>Your bet history shows a gray <span className="text-gray-400 font-semibold">REFUND</span> badge</li>
            </ul>
          </div>
        ),
      },
      {
        question: "What if a round cannot be resolved?",
        answer:
          "If Chillo cannot confirm the result (for example, a data source is temporarily unavailable), the round is held open and retried the following day. Rounds are never resolved without confirmed real-world data. In the rare event of a permanent data failure, all bets will be fully refunded.",
      },
    ],
  },
  {
    title: "Wallet & Security",
    icon: "🔐",
    items: [
      {
        question: "Which wallets are supported?",
        answer: (
          <div className="space-y-2 text-muted">
            <p>Chillo supports any Solana wallet that injects a standard wallet adapter. Tested and recommended:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><span className="text-white">Phantom</span> — most popular, available at phantom.app</li>
              <li><span className="text-white">Backpack</span> — available at backpack.app</li>
            </ul>
            <p>Make sure to switch your wallet to <span className="text-yellow-400">Devnet</span> before connecting.</p>
          </div>
        ),
      },
      {
        question: "Is my wallet safe?",
        answer:
          "Chillo never asks for your private key or seed phrase. All interactions are standard Solana transactions that you sign in your own wallet. We only read your public key (wallet address) to look up your bets and balance. You are always in control of your funds.",
      },
      {
        question: "What network does Chillo use?",
        answer: (
          <div className="space-y-2 text-muted">
            <p>Chillo currently runs on <span className="text-yellow-400 font-semibold">Solana Devnet</span> — a test network where SOL has no real-world value. This means:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>You cannot lose real money</li>
              <li>You can get free devnet SOL from the <a href="https://faucet.solana.com" target="_blank" rel="noreferrer" className="text-brand hover:underline">Solana faucet</a></li>
              <li>Transaction speeds and fees mirror mainnet behavior</li>
            </ul>
            <p>Mainnet launch will be announced when the platform is fully audited.</p>
          </div>
        ),
      },
      {
        question: "How are transactions verified?",
        answer:
          "After you send SOL, Chillo automatically looks up your transaction on the Solana blockchain and confirms: the payment went through without errors, it was sent recently (within 5 minutes), it came from your wallet, and the amount matches your bet. Your bet is only registered after all checks pass — this protects everyone from fake or duplicate bets.",
      },
    ],
  },
  {
    title: "Referral Program",
    icon: "🔗",
    items: [
      {
        question: "How does the referral program work?",
        answer:
          "Go to your Profile page and copy your unique referral link. Share it with friends. When someone connects their wallet for the first time via your link, they are registered as your referral and all their future bets earn you a reward.",
      },
      {
        question: "How much do I earn from referrals?",
        answer:
          "You earn 1% of every bet placed by wallets you referred. This is tracked automatically and accumulates over time. The more active your referrals, the more you earn — there is no cap.",
      },
      {
        question: "When are referral rewards paid?",
        answer:
          "Referral earnings are tracked in your profile stats. Payouts are currently manual and batched. Automated referral payouts are on the roadmap for a future release.",
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
    <div className="min-h-screen bg-base pt-14">
      <div className="max-w-3xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-brand rounded-lg flex items-center justify-center text-black font-bold text-sm shrink-0">
              C
            </div>
            <div>
              <h1 className="text-white font-bold text-2xl leading-tight">
                Chill<span className="text-brand">o</span> FAQ
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
            href="https://github.com/MOVICH28/Chillo/issues"
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
