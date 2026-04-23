"use client";

interface SidebarProps {
  active: string;
  onSelect: (cat: string) => void;
  counts: Record<string, number>;
}

const CATEGORIES = [
  { id: "all", label: "All Markets", icon: "◈", available: true },
  { id: "pumpfun", label: "pump.fun", icon: "🚀", available: true },
  { id: "crypto", label: "Crypto", icon: "₿", available: true },
  { id: "twitter", label: "Twitter / X", icon: "𝕏", available: false },
  { id: "events", label: "Events", icon: "🎯", available: false },
];

export default function Sidebar({ active, onSelect, counts }: SidebarProps) {
  return (
    <aside className="w-52 shrink-0 flex flex-col gap-1 pt-2">
      <p className="px-3 text-[10px] uppercase tracking-widest text-muted mb-1">Categories</p>
      {CATEGORIES.map((cat) => {
        const count = counts[cat.id] ?? 0;
        const isActive = active === cat.id;
        return (
          <button
            key={cat.id}
            onClick={() => cat.available && onSelect(cat.id)}
            disabled={!cat.available}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors w-full text-left
              ${isActive ? "bg-brand/15 text-brand border border-brand/30" : ""}
              ${!isActive && cat.available ? "text-muted hover:text-white hover:bg-surface-3" : ""}
              ${!cat.available ? "text-surface-3 cursor-not-allowed" : ""}
            `}
          >
            <span className="text-base leading-none">{cat.icon}</span>
            <span className="flex-1">{cat.label}</span>
            {cat.available && count > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono
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

      <div className="mt-4 mx-3 p-3 rounded-lg bg-surface-2 border border-surface-3">
        <p className="text-[10px] uppercase tracking-widest text-muted mb-2">How It Works</p>
        <ol className="text-xs text-muted space-y-1.5 list-decimal list-inside">
          <li>Login or Register</li>
          <li>Pick YES or NO</li>
          <li>Set your DORA amount</li>
          <li>Collect winnings!</li>
        </ol>
      </div>
    </aside>
  );
}
