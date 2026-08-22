// ── user-signed on-chain transactions ───────────────────────────────
// Deposits into a REAL vault are signed by the depositor, not by us:
// the API builds an unsigned transaction (it knows the PDAs, the program
// layout and a fresh blockhash), the user's Privy embedded wallet signs
// and broadcasts it, and we hand the signature back so the API can
// record it against the vault.
//
// The server never holds the user's key — that is the whole point of the
// custody story, and it is why deposits cannot be a server-side call.

import { Connection, VersionedTransaction, Transaction } from "@solana/web3.js";

/** Cluster the app trades against, mirrored from the API's /api/meta. */
export function solanaConnection(rpcUrl: string): Connection {
  return new Connection(rpcUrl, "confirmed");
}

/**
 * Decode a base64 transaction from the API. Handles both v0 (versioned)
 * and legacy encodings so the API can switch without breaking the client.
 */
export function decodeTransaction(base64: string): VersionedTransaction | Transaction {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  try {
    return VersionedTransaction.deserialize(bytes);
  } catch {
    return Transaction.from(bytes);
  }
}

/** True when the wallet address looks like a real Solana pubkey. */
export function isSolanaAddress(v: string | undefined): v is string {
  return typeof v === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v);
}
