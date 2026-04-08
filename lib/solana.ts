import { Connection, clusterApiUrl } from "@solana/web3.js";

const network = (process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet") as "devnet" | "mainnet-beta";
const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl(network);

export const connection = new Connection(rpcUrl, "confirmed");

export { network };
