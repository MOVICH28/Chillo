"use client";

import { FC, ReactNode, createContext, useCallback, useContext, useEffect, useState } from "react";

interface WalletContextValue {
  publicKey: string | null;
  connected: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue>({
  publicKey: null,
  connected: false,
  connect: async () => {},
  disconnect: async () => {},
});

export function useWallet() {
  return useContext(WalletContext);
}

interface Props {
  children: ReactNode;
}

const SolanaWalletProvider: FC<Props> = ({ children }) => {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const solana = (window as any).solana;
    if (solana?.isPhantom && solana.isConnected && solana.publicKey) {
      setPublicKey(solana.publicKey.toString());
      setConnected(true);
    }
  }, []);

  const connect = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const solana = (window as any).solana;
    if (!solana?.isPhantom) {
      window.open("https://phantom.app/", "_blank");
      return;
    }
    const resp = await solana.connect();
    setPublicKey(resp.publicKey.toString());
    setConnected(true);
  }, []);

  const disconnect = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const solana = (window as any).solana;
    await solana?.disconnect();
    setPublicKey(null);
    setConnected(false);
  }, []);

  return (
    <WalletContext.Provider value={{ publicKey, connected, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  );
};

export default SolanaWalletProvider;
