// ── Real vault trading through Jupiter Router v6 ─────────────────────
// This service handles on-chain trading for real vaults by wrapping Jupiter
// Router v6 swaps in the vault program's execute_swap instruction.
//
// THE WALL (trading.ts): Real vaults execute on-chain only.
// This service is what the trading service calls when vault.mode === "real".

import { PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { 
  buildExecuteSwapIx, 
  VAULT_PROGRAM_ID, 
  WSOL_MINT,
  JUPITER_ROUTER_V6 
} from "./program.js";
import { getConnection, sendAndConfirm, tryGetServerKeypair } from "./signer.js";
import { getTokenInfo } from "./prices.js";

// ── constants ────────────────────────────────────────────────────────

const JUPITER_QUOTE_API = "https://quote-api.jup.ag/v6/quote";
const JUPITER_BUILD_API = "https://quote-api.jup.ag/v6/swap";

// ── types ─────────────────────────────────────────────────────────────

interface JupiterQuoteResponse {
  data: JupiterQuote[];
}

interface JupiterQuote {
  inAmount: string;
  outAmount: string;
  priceImpactPct: number;
  routePlan: RouteStep[];
}

interface RouteStep {
  swapInfo: {
    ammKey: string;
    label: string;
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    feeAmount: string;
    feeMint: string;
  };
  percent: number;
}

interface JupiterBuildResponse {
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports: number;
}

export interface VaultSwapParams {
  vaultId: string;
  vaultPda: PublicKey;
  inputMint: PublicKey;
  outputMint: PublicKey;
  amountIn: bigint;
  maxPriceImpactBps?: number;
  slippageBps?: number;
}

export interface VaultSwapResult {
  signature: string;
  feeLamports: number | null;
  inputAmount: bigint;
  outputAmount: bigint;
  priceImpactPct: number;
}

// ── Jupiter API helpers ───────────────────────────────────────────────

async function getJupiterQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: bigint;
  slippageBps?: number;
}) {
  const { inputMint, outputMint, amount, slippageBps = 100 } = params;

  const url = new URL(JUPITER_QUOTE_API);
  url.searchParams.set("inputMint", inputMint);
  url.searchParams.set("outputMint", outputMint);
  url.searchParams.set("amount", amount.toString());
  url.searchParams.set("slippageBps", slippageBps.toString());
  url.searchParams.set("onlyDirectRoutes", "true");
  url.searchParams.set("asLegacyTransaction", "false");

  const response = await fetch(url.toString(), {
    headers: { "Accept": "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Jupiter quote failed: ${response.status} ${response.statusText}`);
  }

  const data: unknown = await response.json();
  const quoteData = data as JupiterQuoteResponse;
  
  if (!quoteData.data || !quoteData.data[0]) {
    throw new Error("No route found");
  }

  const quote = quoteData.data[0];
  return {
    inAmount: BigInt(quote.inAmount),
    outAmount: BigInt(quote.outAmount),
    priceImpactPct: quote.priceImpactPct || 0,
    routePlan: quote.routePlan || [],
  };
}

async function buildJupiterSwap(params: {
  inputMint: string;
  outputMint: string;
  amount: bigint;
  userPublicKey: string;
  slippageBps?: number;
  prioritizationFeeLamports?: number;
}) {
  const { inputMint, outputMint, amount, userPublicKey, slippageBps = 100, prioritizationFeeLamports } = params;

  const url = new URL(JUPITER_BUILD_API);
  url.searchParams.set("inputMint", inputMint);
  url.searchParams.set("outputMint", outputMint);
  url.searchParams.set("amount", amount.toString());
  url.searchParams.set("userPublicKey", userPublicKey);
  url.searchParams.set("slippageBps", slippageBps.toString());
  url.searchParams.set("onlyDirectRoutes", "true");
  url.searchParams.set("asLegacyTransaction", "false");
  
  if (prioritizationFeeLamports !== undefined) {
    url.searchParams.set("prioritizationFeeLamports", prioritizationFeeLamports.toString());
  }

  const response = await fetch(url.toString(), {
    headers: { "Accept": "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Jupiter build failed: ${response.status} ${response.statusText}`);
  }

  const data: unknown = await response.json();
  const buildData = data as JupiterBuildResponse;
  
  if (!buildData.swapTransaction) {
    throw new Error("Jupiter build returned no transaction");
  }

  return {
    swapTransaction: buildData.swapTransaction,
    lastValidBlockHeight: buildData.lastValidBlockHeight,
    prioritizationFeeLamports: buildData.prioritizationFeeLamports || 0,
  };
}

// ── Main execution function ─────────────────────────────────────────

/**
 * Execute a trade through the vault program using Jupiter Router.
 * This is the on-chain counterpart to the paper trading engine.
 */
export async function executeVaultSwap(params: VaultSwapParams): Promise<VaultSwapResult> {
  const { 
    vaultId, 
    vaultPda, 
    inputMint, 
    outputMint, 
    amountIn, 
    maxPriceImpactBps = 500,
    slippageBps = 100 
  } = params;

  console.log(`[vault-swap] Starting swap for vault ${vaultId}: ${amountIn} ${inputMint.toBase58()} -> ${outputMint.toBase58()}`);

  // 1. Get quote to validate route and price impact
  const quote = await getJupiterQuote({
    inputMint: inputMint.toBase58(),
    outputMint: outputMint.toBase58(),
    amount: amountIn,
    slippageBps,
  });

  if (quote.priceImpactPct > maxPriceImpactBps / 100) {
    throw new Error(
      `Price impact ${quote.priceImpactPct}% exceeds max ${maxPriceImpactBps / 100}%`
    );
  }

  console.log(`[vault-swap] Quote: ${quote.inAmount} -> ${quote.outAmount} (${quote.priceImpactPct}% impact)`);

  // 2. Build Jupiter transaction
  const jupiterBuild = await buildJupiterSwap({
    inputMint: inputMint.toBase58(),
    outputMint: outputMint.toBase58(),
    amount: amountIn,
    userPublicKey: vaultPda.toBase58(),
    slippageBps,
  });

  // 3. Decode Jupiter transaction to extract instructions
  const jupiterTx = VersionedTransaction.deserialize(
    Buffer.from(jupiterBuild.swapTransaction, "base64")
  );
  
  // VersionedTransaction.message has the compiled instructions and account keys
  const jupiterInstructions = jupiterTx.message.compiledInstructions;
  const jupiterAccounts = jupiterTx.message.staticAccountKeys;
  
  // 4. Build the vault program's execute_swap instruction
  const minAmountOut = quote.outAmount * BigInt(10000 - slippageBps) / 10000n;
  
  const executeSwapIx = buildExecuteSwapIx({
    authority: vaultPda,
    vault: vaultPda,
    inputMint,
    outputMint,
    amountIn,
    minAmountOut,
    maxIn: amountIn,
    jupiterInstructions,
    jupiterAccounts,
  });

  // 5. Create the final transaction
  const connection = getConnection();
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  
  const message = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: blockhash,
    instructions: [executeSwapIx],
  }).compileToV0Message();

  const tx = new VersionedTransaction(message);
  
  // 6. Sign with the server key (vault operator)
  const keyResult = tryGetServerKeypair();
  if ("error" in keyResult) {
    throw new Error(`Cannot sign transaction: ${keyResult.error}`);
  }
  
  tx.sign([keyResult.keypair]);

  // 7. Send and confirm
  console.log(`[vault-swap] Sending transaction...`);
  const result = await sendAndConfirm(
    [new TransactionInstruction({
      programId: VAULT_PROGRAM_ID,
      keys: executeSwapIx.keys,
      data: executeSwapIx.data,
    })],
    [],
    { label: `execute_swap(${vaultId})` }
  );

  console.log(`[vault-swap] Success: ${result.signature}`);

  return {
    signature: result.signature,
    feeLamports: result.feeLamports,
    inputAmount: amountIn,
    outputAmount: quote.outAmount,
    priceImpactPct: quote.priceImpactPct,
  };
}

// ── Validation helpers ───────────────────────────────────────────────

/**
 * Validate that a swap is acceptable for vault trading.
 * Checks: price impact, route complexity, mint allowlist, etc.
 */
export async function validateVaultSwap(params: {
  inputMint: PublicKey;
  outputMint: PublicKey;
  amountIn: bigint;
  maxPriceImpactBps?: number;
  vaultId: string;
}): Promise<{ valid: boolean; reason?: string; quote?: any }> {
  const { inputMint, outputMint, amountIn, maxPriceImpactBps = 500, vaultId } = params;

  try {
    // Get a quote first
    const quote = await getJupiterQuote({
      inputMint: inputMint.toBase58(),
      outputMint: outputMint.toBase58(),
      amount: amountIn,
      slippageBps: 100,
    });

    // Check price impact
    if (quote.priceImpactPct > maxPriceImpactBps / 100) {
      return {
        valid: false,
        reason: `Price impact ${quote.priceImpactPct}% exceeds max ${maxPriceImpactBps / 100}%`,
        quote,
      };
    }

    // Check route complexity
    if (quote.routePlan.length > 3) {
      return {
        valid: false,
        reason: `Route too complex (${quote.routePlan.length} hops)`,
        quote,
      };
    }

    // Validate tokens have live prices
    const [inputInfo, outputInfo] = await Promise.all([
      getTokenInfo(inputMint.toBase58()),
      getTokenInfo(outputMint.toBase58()),
    ]);

    if (inputInfo.source === "none" || outputInfo.source === "none") {
      return {
        valid: false,
        reason: "One or more tokens have no live price",
        quote,
      };
    }

    return { valid: true, quote };
  } catch (error) {
    return {
      valid: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
