import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: "#1db954",
        "brand-dim": "#17a349",
        // Theme-aware via CSS variables — supports opacity modifiers (bg-surface/50 etc.)
        base:       "rgb(var(--color-base)       / <alpha-value>)",
        surface:    "rgb(var(--color-surface)    / <alpha-value>)",
        "surface-2":"rgb(var(--color-surface-2)  / <alpha-value>)",
        "surface-3":"rgb(var(--color-surface-3)  / <alpha-value>)",
        muted:      "rgb(var(--color-muted)      / <alpha-value>)",
        yes: "#1db954",
        no: "#e63946",
      },
      fontFamily: {
        mono: ["var(--font-geist-mono)", "monospace"],
        sans: ["var(--font-geist-sans)", "sans-serif"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "ticker": "ticker 30s linear infinite",
      },
      keyframes: {
        ticker: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
