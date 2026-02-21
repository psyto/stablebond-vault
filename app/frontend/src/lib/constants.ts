import { PublicKey } from "@solana/web3.js";

export const CORE_PROGRAM_ID = new PublicKey(
  "3fnWkVPz51AJjYodQY5VCzteD5enRmkWBTsu3gPedaYs"
);

export const YIELD_PROGRAM_ID = new PublicKey(
  "DLFUfzV4iqCzxmmXmCpR7qH6nhvPSLUekq7JCezV1LeE"
);

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";

export const NETWORK =
  (process.env.NEXT_PUBLIC_NETWORK as "devnet" | "mainnet-beta") ?? "devnet";

export const PROGRAM_IDS = {
  core: CORE_PROGRAM_ID,
  yield: YIELD_PROGRAM_ID,
};
