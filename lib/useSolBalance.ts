"use client";
import { useState, useEffect } from "react";

const RPC = "https://api.devnet.solana.com";

export function useSolBalance(publicKey: string | null): number | null {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!publicKey) { setBalance(null); return; }

    async function fetch() {
      try {
        const res = await window.fetch(RPC, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0", id: 1,
            method: "getBalance",
            params: [publicKey],
          }),
        });
        const json = await res.json();
        if (typeof json?.result?.value === "number") {
          setBalance(json.result.value / 1e9);
        }
      } catch { /* keep previous */ }
    }

    fetch();
    const id = setInterval(fetch, 30_000);
    window.addEventListener("betPlaced", fetch);
    return () => {
      clearInterval(id);
      window.removeEventListener("betPlaced", fetch);
    };
  }, [publicKey]);

  return balance;
}
