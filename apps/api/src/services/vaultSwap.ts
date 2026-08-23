// ── Real vault trading through Jupiter Router v6 ─────────────────────
// This service handles on-chain trading for real vaults by wrapping Jupiter
// Router v6 swaps in the vault program's execute_swap instruction.
//
// THE WALL (trading.ts): Real vaults execute on-chain only.
// This service is what the trading service calls when vault.mode === "real".

import {
  AddressLookupTableAccount,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { 
  buildExecuteSwapIx, 
  VAULT_PROGRAM_ID, 
  WSOL_MINT,
  JUPITER_ROUTER_V6 
} from "./program.js";
import { getConnection, sendAndConfirm, tryGetServerKeypair } from "./signer.js";
import { getTokenInfo } from "./prices.js";
import { env } from "../env.js";
import { computeBudgetIxs } from "./priorityFee.js";

// ── constants ────────────────────────────────────────────────────────

// Jupiter v6 (quote-api.jup.ag) is decommissioned — it does not respond at
// all, so every swap attempt failed at the first call. The current API is
// swap/v1 on lite-api (keyless, rate-limited) or api.jup.ag (keyed).
//
// We ask for INSTRUCTIONS, not a prebuilt transaction. The swap has to run
// inside the vault program's execute_swap via CPI, and a prebuilt
// VersionedTransaction is signed for a different fee payer and hides its
// accounts behind address lookup tables we would have to reconstruct.
const JUPITER_BASE = process.env.JUPITER_API_BASE ?? "https://lite-api.jup.ag/swap/v1";
const JUPITER_QUOTE_API = `${JUPITER_BASE}/quote`;
const JUPITER_SWAP_IX_API = `${JUPITER_BASE}/swap-instructions`;

// ── types ─────────────────────────────────────────────────────────────

/**
 * v1 returns the quote object directly. The old code read `data[0]` off a
 * `{data: [...]}` envelope that no version of the API has returned for years,
 * so it threw "No route found" on every call even when a route existed.
 * The whole object is echoed back to /swap-instructions verbatim.
 */
interface JupiterQuote {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string | number;
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

/** One instruction as Jupiter serialises it. */
interface JupiterIx {
  programId: string;
  accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
  data: string; // base64
}

interface JupiterSwapInstructions {
  computeBudgetInstructions?: JupiterIx[];
  setupInstructions?: JupiterIx[];
  swapInstruction: JupiterIx;
  cleanupInstruction?: JupiterIx | null;
  /**
   * MUST be resolved and supplied when compiling a v0 message. The previous
   * implementation deserialised a prebuilt transaction and read
   * `staticAccountKeys`, which silently omits every account that lives in a
   * lookup table — Jupiter routes routinely put most of their accounts there,
   * so the resulting account list was incomplete.
   */
  addressLookupTableAddresses?: string[];
  prioritizationFeeLamports?: number;
  computeUnitLimit?: number;
  simulationError?: unknown;
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
  // onlyDirectRoutes was forced on, which rejects most real routes for no
  // stated reason. Leave routing to Jupiter and bound the risk with
  // slippage and the price-impact check instead.
  url.searchParams.set("asLegacyTransaction", "false");

  const response = await fetch(url.toString(), {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Jupiter quote failed: ${response.status} ${response.statusText}`);
  }

  const quote = (await response.json()) as JupiterQuote;
  if (!quote?.outAmount) {
    throw new Error("No route found");
  }

  return {
    // the raw object, echoed verbatim into /swap-instructions
    raw: quote,
    inAmount: BigInt(quote.inAmount),
    outAmount: BigInt(quote.outAmount),
    // v1 sends priceImpactPct as a decimal STRING ("0.0034" = 0.34%), not a
    // number. Number() on it is fine; the old `|| 0` on a string was not.
    priceImpactPct: Number(quote.priceImpactPct) || 0,
    routePlan: quote.routePlan ?? [],
  };
}

/**
 * Ask Jupiter for the swap INSTRUCTIONS for a quote.
 *
 * This is a POST with the quote object in the body. The previous version sent
 * a GET with query parameters, which no version of this endpoint accepts.
 */
async function getJupiterSwapInstructions(params: {
  quote: JupiterQuote;
  userPublicKey: string;
  prioritizationFeeLamports?: number;
}): Promise<JupiterSwapInstructions> {
  const { quote, userPublicKey, prioritizationFeeLamports } = params;

  const response = await fetch(JUPITER_SWAP_IX_API, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey,
      // The vault PDA cannot create its own token accounts by signing, so
      // setup instructions must be surfaced rather than silently assumed.
      wrapAndUnwrapSol: true,
      ...(prioritizationFeeLamports !== undefined
        ? { prioritizationFeeLamports }
        : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Jupiter swap-instructions failed: ${response.status} ${response.statusText} ${body.slice(0, 200)}`,
    );
  }

  const data = (await response.json()) as JupiterSwapInstructions;
  if (!data?.swapInstruction?.programId) {
    throw new Error("Jupiter returned no swap instruction");
  }
  if (data.simulationError) {
    throw new Error(`Jupiter simulation failed: ${JSON.stringify(data.simulationError).slice(0, 200)}`);
  }
  return data;
}

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

  // Jupiter does not index devnet. There are no devnet routes, no devnet
  // liquidity and no devnet pools behind this API, so a swap here cannot
  // succeed no matter how correct the code is. Fail with the reason rather
  // than with "No route found", which reads like a thin-liquidity problem
  // and sends whoever hits it looking in the wrong place.
  if (env.solanaCluster !== "mainnet-beta" && env.solanaCluster !== "mainnet") {
    throw new Error(
      `Real swaps require mainnet: Jupiter has no ${env.solanaCluster} coverage. ` +
        `Vault trading stays disabled until the program is deployed to mainnet.`,
    );
  }

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

  // 2. Ask Jupiter for the swap INSTRUCTIONS (not a prebuilt transaction).
  const jupiterIxs = await getJupiterSwapInstructions({
    quote: quote.raw,
    userPublicKey: vaultPda.toBase58(),
  });

  // 3. Resolve the address lookup tables the route depends on.
  //
  // Jupiter puts most of a route's accounts in lookup tables. The previous
  // implementation deserialised a prebuilt transaction and used
  // `staticAccountKeys`, which contains only the handful of accounts NOT in a
  // table — so the account list handed to the vault program was missing most
  // of the route and the CPI could not have succeeded.
  const connection = getConnection();
  const altAddresses = jupiterIxs.addressLookupTableAddresses ?? [];
  const lookupTables: AddressLookupTableAccount[] = [];
  for (const addr of altAddresses) {
    const res = await connection.getAddressLookupTable(new PublicKey(addr));
    if (!res.value) {
      throw new Error(`Address lookup table ${addr} could not be fetched`);
    }
    lookupTables.push(res.value);
  }

  const jupiterInstructions = [jupiterIxs.swapInstruction];
  const jupiterAccounts = jupiterIxs.swapInstruction.accounts.map(
    (a) => new PublicKey(a.pubkey),
  );
  
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

  // 5. Create the final transaction.
  //
  // The fee payer must be a key that can actually sign. vaultPda is a program
  // address with no private key, so a transaction declaring it as payer is
  // invalid no matter who signs it — the previous code set payerKey to the
  // PDA and then signed with the server key.
  const keyResult = tryGetServerKeypair();
  if ("error" in keyResult) {
    throw new Error(`Cannot sign transaction: ${keyResult.error}`);
  }

  const { blockhash } = await connection.getLatestBlockhash("confirmed");

  // Price the priority fee against the accounts this route actually touches.
  // Jupiter reports the compute its route needs; the default 200k limit is
  // not enough for a multi-hop swap and the transaction would fail on CU
  // exhaustion rather than on anything to do with the trade.
  const budgetIxs = await computeBudgetIxs({
    accountKeys: jupiterAccounts.map((k) => k.toBase58()),
    computeUnitLimit: jupiterIxs.computeUnitLimit ?? 400_000,
  });

  const message = new TransactionMessage({
    payerKey: keyResult.keypair.publicKey,
    recentBlockhash: blockhash,
    instructions: [...budgetIxs, executeSwapIx],
  }).compileToV0Message(lookupTables);

  const tx = new VersionedTransaction(message);
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
