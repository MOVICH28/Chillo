/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@solana/wallet-adapter-react",
    "@solana/wallet-adapter-react-ui",
    "@solana/wallet-adapter-base",
    "@solana/wallet-adapter-phantom",
  ],
};

export default nextConfig;
