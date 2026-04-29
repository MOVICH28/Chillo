"use client";

import Link from "next/link";

interface SidebarProps {
  active: string;
  onSelect: (cat: string) => void;
  counts: Record<string, number>;
}

const CATEGORIES = [
  { id: "all", label: "All Markets", icon: "◈", available: true },
  { id: "pumpfun", label: "pump.fun", icon: "🚀", available: true },
  { id: "crypto", label: "Crypto", icon: "₿", available: true },
  { id: "twitter", label: "Twitter / X", icon: "𝕏", available: true },
  { id: "events", label: "Events", icon: "🎯", available: false },
];

export default function Sidebar({ active, onSelect, counts }: SidebarProps) {
  return (
    <aside className="w-40 shrink-0 flex flex-col gap-1 pt-2">
      <p className="px-2 text-[10px] uppercase tracking-widest text-muted mb-1">Categories</p>
      {CATEGORIES.map((cat) => {
        const count = counts[cat.id] ?? 0;
        const isActive = active === cat.id;
        return (
          <button
            key={cat.id}
            onClick={() => cat.available && onSelect(cat.id)}
            disabled={!cat.available}
            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm font-medium transition-colors w-full text-left
              ${isActive ? "bg-brand/15 text-brand border border-brand/30" : ""}
              ${!isActive && cat.available ? "text-muted hover:text-white hover:bg-surface-3" : ""}
              ${!cat.available ? "text-surface-3 cursor-not-allowed" : ""}
            `}
          >
            <span className="text-base leading-none">{cat.icon}</span>
            <span className="flex-1 truncate">{cat.label}</span>
            {cat.available && count > 0 && (
              <span
                className={`text-xs px-1.5 py-0.5 rounded-full font-mono
                  ${isActive ? "bg-brand/20 text-brand" : "bg-surface-3 text-muted"}`}
              >
                {count}
              </span>
            )}
            {!cat.available && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-3 text-muted">
                soon
              </span>
            )}
          </button>
        );
      })}

      <div className="mt-4 flex flex-col gap-1 border-t border-surface-3 pt-3">
        <Link href="/faq"
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm font-medium text-muted hover:text-white hover:bg-surface-3 transition-colors">
          <span className="text-base leading-none">❓</span>
          <span>FAQ</span>
        </Link>
        <a href="https://x.com/pumpdora" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm font-medium text-muted hover:text-white hover:bg-surface-3 transition-colors">
          <svg className="w-4 h-4 shrink-0 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          <span>@pumpdora</span>
        </a>
      </div>
    </aside>
  );
}
