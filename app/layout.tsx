import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import SolanaWalletProvider from "@/components/WalletProvider";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Pumpdora — Solana Prediction Markets",
  description: "Bet on pump.fun tokens, crypto prices, and real-world events on Solana devnet with Pumpdora.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* Inject theme before first paint to avoid flash of wrong theme */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{if(localStorage.getItem('theme')==='light'){document.documentElement.classList.add('light');}}catch(e){}})();` }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-base`}>
        <SolanaWalletProvider>{children}</SolanaWalletProvider>
      </body>
    </html>
  );
}
