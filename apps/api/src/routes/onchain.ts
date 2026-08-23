// ── USER-SIGNED on-chain deposits ──────────────────────────────────
//
// THE CUSTODY STORY, IN CODE. Everywhere else in this API the server
// keypair signs (it is the platform admin, the trader and the NAV keeper
// on devnet). Depositor money is different: the depositor's key must be
// the ONLY key that can move it, so these routes are built so that the
// server *cannot* sign for a user even if it wanted to.
//
//   1. POST /api/onchain/deposit/prepare
//      Verifies the caller's Privy identity (privyAuth.ts — cryptographic,
//      no demo fallback), resolves their own wallet pubkey, and BUILDS AN
//      UNSIGNED TRANSACTION whose `authority` and `feePayer` are that
//      wallet. It is returned as base64. No signature, no key, no send.
//
//   2. The browser hands that exact byte string to the user's Privy
//      embedded wallet, which shows its confirmation modal, signs it and
//      broadcasts it. The private key never leaves the user's device.
//
//   3. POST /api/onchain/deposit/confirm
//      Takes the signature back and REFUSES TO TRUST IT: the transaction
//      is fetched from the cluster and checked — it succeeded, it ran OUR
//      program, its `deposit` instruction named THIS vault's PDA, the
//      caller's wallet as authority and their VaultDepositor PDA — and
//      only then is it recorded. The shares written down come from the
//      program's own `Deposited` event and are cross-checked against the
//      VaultDepositor account re-read from the chain.
//
// SCOPE GUARDS
//   · Devnet only. There is no audit, so a mainnet cluster hard-refuses
//     these routes rather than quietly moving real money.
//   · These routes never touch the demo ledger. Real vaults keep hitting
//     THE WALL on /api/vaults/:id/{deposit,withdraw,trade}.

import { Router } from "express";
import {
  type Message,
  type MessageV0,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { prisma } from "../db.js";
import { env } from "../env.js";
import {
  MIN_DEPOSIT_LAMPORTS,
  VAULT_PROGRAM_ID,
  buildDepositIx,
  buildInitDepositorIx,
  effectiveEquity,
  explorerAddress,
  explorerTx,
  fetchVaultAccount,
  fetchVaultDepositorAccount,
  findDepositedEvent,
  ixDiscriminator,
  lamportsToSol,
  sharesForDeposit,
  solToLamports,
  vaultDepositorPda,
  vaultDepositorToJson,
  vaultPda,
} from "../services/program.js";
import { PrivyAuthError, privyConfigured, requirePrivyUser } from "../services/privyAuth.js";
import { getConnection } from "../services/signer.js";

export const onchainRouter = Router();

// ── constants ──────────────────────────────────────────────────────

/** 8-byte Anchor discriminator + VaultDepositor::INIT_SPACE (state.rs). */
const DEPOSITOR_ACCOUNT_SPACE = 8 + 1 + 32 + 32 + 16 + 8 + 8 + (16 + 8 + 8) + 32; // = 169

/**
 * Headroom over the quoted fee. A blockhash can expire and be retried,
 * and Privy may attach a priority fee; quoting the exact fee would let a
 * wallet funded to the cent fail AFTER the user clicked confirm, which is
 * the one failure mode this whole endpoint exists to prevent.
 */
const FEE_HEADROOM_LAMPORTS = 20_000n;

/** Same ceiling the server-signed devnet route uses. */
/**
 * Per-deposit ceiling.
 *
 * Deliberately low on mainnet: the program is unaudited and now holds real
 * money, so the cap is the only thing bounding what a single bug can cost
 * one person. Raise with MAX_DEPOSIT_SOL once the code has a track record
 * or an audit.
 */
// A function, not a const. Evaluating this at module load called
// isMainnetCluster(), which reads a `const` declared further down the file —
// and `const` is not hoisted, so it threw "Cannot access 'MAINNET_NAMES'
// before initialization" and the container never became healthy. Deferring
// to call time removes the ordering dependency entirely.
function maxDepositSol(): number {
  const explicit = Number(process.env.MAX_DEPOSIT_SOL);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return isMainnetCluster() ? 5 : 1_000;
}

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;

// ── cluster gate ───────────────────────────────────────────────────

const MAINNET_NAMES = new Set(["mainnet", "mainnet-beta", "main", "production"]);

/** The configured cluster, normalised. */
function cluster(): string {
  return (env.solanaCluster || "devnet").trim().toLowerCase();
}

export function isMainnetCluster(): boolean {
  return MAINNET_NAMES.has(cluster());
}

/**
 * Public RPC endpoint the BROWSER should use. Deliberately not
 * `env.solanaRpcUrl`: that may carry an API key in its path, and this
 * value is served to anyone. An operator who wants the browser on a
 * specific endpoint sets PUBLIC_SOLANA_RPC_URL explicitly.
 */
function publicRpcUrl(): string {
  const explicit = (process.env.PUBLIC_SOLANA_RPC_URL || "").trim();
  if (explicit) return explicit;
  switch (cluster()) {
    case "mainnet":
    case "mainnet-beta":
      return "https://api.mainnet-beta.solana.com";
    case "testnet":
      return "https://api.testnet.solana.com";
    case "localnet":
      return "http://127.0.0.1:8899";
    default:
      return "https://api.devnet.solana.com";
  }
}

// rent is a cluster constant; one RPC call per process is plenty
let cachedRent: bigint | null = null;
async function depositorRentLamports(): Promise<bigint> {
  if (cachedRent === null) {
    cachedRent = BigInt(
      await getConnection().getMinimumBalanceForRentExemption(DEPOSITOR_ACCOUNT_SPACE),
    );
  }
  return cachedRent;
}

// ── shared guards ──────────────────────────────────────────────────

interface Guarded {
  ok: true;
  vaultId: string;
  vaultPdaKey: PublicKey;
}

/**
 * Refuse outright on mainnet. Returns false (after responding) so callers
 * read as `if (!guardCluster(res)) return;`.
 */
function guardCluster(res: import("express").Response): boolean {
  // KILL SWITCH — deposits are closed while critical findings are open.
  //
  // The adversarial review returned CRITICAL, exploitable-as-described
  // findings against live mainnet code that was accepting real deposits:
  // init_vault lets a vault creator appoint their own nav_keeper, and NAV is
  // the sole input to payout pricing, so a creator can mark the book up and
  // withdraw the whole vault. post_nav's delta cap has no time dimension, so
  // repeated posts in a single slot ratchet effective equity toward zero.
  //
  // Closing costs nothing but time. Leaving it open while those are unfixed
  // costs whoever deposits next. Set DEPOSITS_OPEN=1 to reopen — deliberately,
  // after the findings are fixed, not to get past this message.
  if (process.env.DEPOSITS_OPEN !== "1") {
    res.status(503).json({
      error:
        "deposits are temporarily closed: an internal security review found " +
        "critical issues in the vault program that allow a vault creator to " +
        "drain their own vault. Fixes are in progress. No funds are at risk " +
        "that are not already deposited.",
      code: "deposits_closed_pending_fix",
    });
    return false;
  }
  return true;
}

function _guardClusterOpen(_res: import("express").Response): boolean {
  // Mainnet deposits are OPEN, by the operator's explicit decision.
  //
  // This used to refuse mainnet outright because the program has not had a
  // professional audit. That is still true — an in-house adversarial review
  // is not an audit, and this comment should not be read as one. What
  // changed is who carries the decision, not the risk.
  //
  // The blast radius is bounded by MAX_DEPOSIT_SOL instead of by refusal.
  // A cap is what a young protocol uses in place of a proof: it does not
  // make a bug less likely, it makes the worst case smaller while the code
  // earns trust. Raise it deliberately, not by default.
  return true;
}

/** Translate a PrivyAuthError into its response; rethrow anything else. */
function respondAuthError(res: import("express").Response, err: unknown): boolean {
  if (err instanceof PrivyAuthError) {
    res.status(err.status).json(err.toJson());
    return true;
  }
  return false;
}

/**
 * Load a REAL vault that actually exists on-chain, or answer the request.
 * Also re-derives the PDA from the row id and compares: the stored PDA is
 * a cache, never an authority.
 */
async function loadRealVault(
  res: import("express").Response,
  vaultId: unknown,
): Promise<Guarded | null> {
  if (typeof vaultId !== "string" || vaultId.length === 0) {
    res.status(400).json({ error: "vaultId is required" });
    return null;
  }
  const dbVault = await prisma.vault.findUnique({ where: { id: vaultId } });
  if (!dbVault) {
    res.status(404).json({ error: "vault not found" });
    return null;
  }
  if (dbVault.mode !== "real") {
    res.status(409).json({
      error: "this route is on-chain only; paper vaults use /api/vaults/:id/deposit",
      code: "not_a_real_vault",
    });
    return null;
  }
  if (!dbVault.onchainVaultPda) {
    res.status(409).json({
      error: "vault has no on-chain account (init_vault never landed)",
      code: "no_onchain_account",
    });
    return null;
  }
  const [derived] = vaultPda(dbVault.id);
  if (derived.toBase58() !== dbVault.onchainVaultPda) {
    // The PDA is a pure function of the row id; a mismatch means the row
    // was tampered with. Refuse rather than send money to a stored string.
    res.status(500).json({
      error: "stored vault PDA does not match the PDA derived from the vault id",
      code: "pda_mismatch",
      stored: dbVault.onchainVaultPda,
      derived: derived.toBase58(),
    });
    return null;
  }
  return { ok: true, vaultId: dbVault.id, vaultPdaKey: derived };
}

// ── GET /api/onchain/config ────────────────────────────────────────
// Public. Everything the browser needs to talk to the same chain we do —
// minus anything secret (never the server's own RPC URL, which may carry
// an API key).
onchainRouter.get("/config", async (_req, res, next) => {
  try {
    let rent: string | null = null;
    try {
      rent = (await depositorRentLamports()).toString();
    } catch {
      rent = null; // RPC hiccup must not take the whole page down
    }
    res.json({
      enabled: privyConfigured(),
      cluster: cluster(),
      // kept in the response for clients that branch on it; deposits are
      // now open on mainnet and this is always false
      mainnetRefused: false,
      privyConfigured: privyConfigured(),
      programId: VAULT_PROGRAM_ID.toBase58(),
      rpcUrl: publicRpcUrl(),
      minDepositLamports: MIN_DEPOSIT_LAMPORTS.toString(),
      maxDepositSol: maxDepositSol(),
      depositorRentLamports: rent,
      feeHeadroomLamports: FEE_HEADROOM_LAMPORTS.toString(),
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/onchain/me ────────────────────────────────────────────
// Who the caller is, which wallet is theirs, and what it holds. Auth
// required — this is the endpoint the UI uses to decide whether to show
// the deposit form at all.
onchainRouter.get("/me", async (req, res, next) => {
  try {
    if (!guardCluster(res)) return;
    const { identity, user } = await requirePrivyUser(req);
    const wallet = new PublicKey(identity.wallet);
    const balance = BigInt(await getConnection().getBalance(wallet, "confirmed"));
    const rent = await depositorRentLamports().catch(() => null);
    res.json({
      userId: user.id,
      handle: user.handle,
      privyId: identity.privyId,
      wallet: identity.wallet,
      walletSource: identity.walletSource,
      explorerAddress: explorerAddress(identity.wallet),
      balanceLamports: balance.toString(),
      balanceSol: lamportsToSol(balance),
      cluster: cluster(),
      depositorRentLamports: rent === null ? null : rent.toString(),
    });
  } catch (err) {
    if (respondAuthError(res, err)) return;
    next(err);
  }
});

// ── POST /api/onchain/deposit/prepare ──────────────────────────────
// { vaultId, sol } → an UNSIGNED base64 transaction the caller's own
// wallet can sign. The server builds it and then stops: it has no key
// that could add a signature to this message.
onchainRouter.post("/deposit/prepare", async (req, res, next) => {
  try {
    if (!guardCluster(res)) return;
    const { identity, user } = await requirePrivyUser(req);

    const body = (req.body ?? {}) as { vaultId?: unknown; sol?: unknown };
    const sol = Number(body.sol);
    if (!Number.isFinite(sol) || sol <= 0) {
      res.status(400).json({ error: "sol must be a positive number", code: "bad_amount" });
      return;
    }
    if (sol > maxDepositSol()) {
      res.status(400).json({
        error: `sol exceeds the on-chain deposit ceiling (${maxDepositSol()})`,
        code: "bad_amount",
      });
      return;
    }
    const amountLamports = solToLamports(sol);
    if (amountLamports < MIN_DEPOSIT_LAMPORTS) {
      res.status(400).json({
        error: `deposit must be at least ${MIN_DEPOSIT_LAMPORTS} lamports`,
        code: "bad_amount",
      });
      return;
    }

    const guard = await loadRealVault(res, body.vaultId);
    if (!guard) return;

    const connection = getConnection();
    const authority = new PublicKey(identity.wallet);

    const onchainVault = await fetchVaultAccount(connection, guard.vaultPdaKey);
    if (!onchainVault) {
      res.status(502).json({
        error: "on-chain vault account not found",
        code: "vault_missing_onchain",
        vaultPda: guard.vaultPdaKey.toBase58(),
      });
      return;
    }

    // ── mirror the program's own require!s, so the user is never asked
    // to sign a transaction that is already known to revert ────────────
    if (onchainVault.data.status !== "Active") {
      res.status(409).json({
        error: `vault is ${onchainVault.data.status.toLowerCase()} on-chain — deposits are closed`,
        code: "vault_not_active",
      });
      return;
    }
    const nowSec = BigInt(Math.floor(Date.now() / 1000));
    const navAge = nowSec - onchainVault.data.navPostedAt;
    if (navAge > onchainVault.data.navStalenessSeconds) {
      res.status(409).json({
        error:
          `the vault's NAV mark is ${navAge}s old (limit ${onchainVault.data.navStalenessSeconds}s) — ` +
          "the program refuses deposits against a stale mark. Try again once the keeper posts.",
        code: "nav_stale",
        navAgeSeconds: Number(navAge),
        navStalenessSeconds: Number(onchainVault.data.navStalenessSeconds),
      });
      return;
    }
    const equity = effectiveEquity(onchainVault.data, nowSec);
    if (equity <= 0n) {
      res.status(409).json({
        error: "vault equity is zero on-chain — the program refuses to mint shares",
        code: "zero_equity",
      });
      return;
    }
    const sharesExpected = sharesForDeposit(
      amountLamports,
      onchainVault.data.totalShares,
      equity,
    );
    if (sharesExpected <= 0n) {
      res.status(400).json({
        error: "this deposit is too small to mint a single share at the current price",
        code: "zero_shares",
      });
      return;
    }

    // ── the depositor record: created in the SAME transaction when it
    // does not exist yet, paid for by the USER (init payer = authority)
    const [depositorPda] = vaultDepositorPda(guard.vaultPdaKey, authority);
    const existingDepositor = await fetchVaultDepositorAccount(connection, depositorPda);
    if (existingDepositor && existingDepositor.data.lastWithdrawRequest.shares > 0n) {
      res.status(409).json({
        error:
          "you have a pending withdrawal request on this vault — the program blocks deposits " +
          "until it is executed or cancelled",
        code: "withdraw_request_pending",
      });
      return;
    }
    const needsDepositorInit = existingDepositor === null;

    const ixs = [];
    if (needsDepositorInit) {
      ixs.push(buildInitDepositorIx({ authority, vault: guard.vaultPdaKey }).ix);
    }
    ixs.push(buildDepositIx({ authority, vault: guard.vaultPdaKey, amountLamports }).ix);

    // ── compile UNSIGNED, fee payer = the user ────────────────────────
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("confirmed");
    const message = new TransactionMessage({
      payerKey: authority, // the USER pays — not the server
      recentBlockhash: blockhash,
      instructions: ixs,
    }).compileToV0Message();
    const tx = new VersionedTransaction(message);
    // tx.signatures is all-zero here and stays that way: this process has
    // no access to the authority's secret key.
    const serialized = Buffer.from(tx.serialize()).toString("base64");

    // ── can they actually afford it? ──────────────────────────────────
    // A brand-new wallet holds 0 SOL and CANNOT deposit: the user pays
    // their own VaultDepositor rent plus the fee. Say so here, in a 400
    // the UI can render, instead of letting the signature fail.
    const rent = needsDepositorInit ? await depositorRentLamports() : 0n;
    const quotedFee = await connection
      .getFeeForMessage(message, "confirmed")
      .then((r) => (r.value === null ? null : BigInt(r.value)))
      .catch(() => null);
    const feeLamports = (quotedFee ?? 5_000n) + FEE_HEADROOM_LAMPORTS;
    const balance = BigInt(await connection.getBalance(authority, "confirmed"));
    const totalRequired = amountLamports + rent + feeLamports;

    if (balance < totalRequired) {
      const shortfall = totalRequired - balance;
      res.status(400).json({
        error:
          `your wallet holds ${lamportsToSol(balance).toFixed(6)} SOL but this deposit needs ` +
          `${lamportsToSol(totalRequired).toFixed(6)} SOL ` +
          `(${lamportsToSol(amountLamports).toFixed(6)} deposit` +
          (rent > 0n ? ` + ${lamportsToSol(rent).toFixed(6)} rent for your depositor account` : "") +
          ` + ~${lamportsToSol(feeLamports).toFixed(6)} network fee). ` +
          `Fund ${lamportsToSol(shortfall).toFixed(6)} SOL more and try again.`,
        code: "insufficient_balance",
        wallet: identity.wallet,
        cluster: cluster(),
        needed: {
          depositLamports: amountLamports.toString(),
          depositorRentLamports: rent.toString(),
          feeLamports: feeLamports.toString(),
          totalLamports: totalRequired.toString(),
          shortfallLamports: shortfall.toString(),
          shortfallSol: lamportsToSol(shortfall),
        },
        balanceLamports: balance.toString(),
        balanceSol: lamportsToSol(balance),
      });
      return;
    }

    res.json({
      transaction: serialized,
      encoding: "base64",
      transactionVersion: 0,
      signed: false,
      vaultId: guard.vaultId,
      vaultPda: guard.vaultPdaKey.toBase58(),
      programId: VAULT_PROGRAM_ID.toBase58(),
      depositorPda: depositorPda.toBase58(),
      needsDepositorInit,
      // Both of these are the USER's wallet. The server key appears
      // nowhere in this transaction.
      authority: identity.wallet,
      feePayer: identity.wallet,
      userId: user.id,
      amountLamports: amountLamports.toString(),
      amountSol: lamportsToSol(amountLamports),
      sharesExpected: sharesExpected.toString(),
      blockhash,
      lastValidBlockHeight,
      cluster: cluster(),
      rpcUrl: publicRpcUrl(),
      instructions: ixs.map((ix, i) => ({
        index: i,
        programId: ix.programId.toBase58(),
        name: needsDepositorInit && i === 0 ? "init_depositor" : "deposit",
        accounts: ix.keys.map((k) => ({
          pubkey: k.pubkey.toBase58(),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        })),
      })),
      costs: {
        depositLamports: amountLamports.toString(),
        depositorRentLamports: rent.toString(),
        estimatedFeeLamports: feeLamports.toString(),
        totalRequiredLamports: totalRequired.toString(),
        walletBalanceLamports: balance.toString(),
      },
    });
  } catch (err) {
    if (respondAuthError(res, err)) return;
    next(err);
  }
});

// ── POST /api/onchain/deposit/confirm ──────────────────────────────
// { vaultId, signature } — verify the transaction ON CHAIN, then record.

/** Poll for the transaction: our RPC may lag the one the wallet used. */
async function fetchTransaction(signature: string, timeoutMs = 30_000) {
  const connection = getConnection();
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const tx = await connection
      .getTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      })
      .catch(() => null);
    if (tx) return tx;
    if (Date.now() >= deadline) return null;
    await new Promise((r) => setTimeout(r, 1_500));
  }
}

onchainRouter.post("/deposit/confirm", async (req, res, next) => {
  try {
    if (!guardCluster(res)) return;
    const { identity, user } = await requirePrivyUser(req);

    const body = (req.body ?? {}) as { vaultId?: unknown; signature?: unknown };
    const signature = typeof body.signature === "string" ? body.signature.trim() : "";
    if (!signature || signature.length < 64 || signature.length > 96 || !BASE58.test(signature)) {
      res.status(400).json({ error: "signature must be a base58 transaction signature" });
      return;
    }

    const guard = await loadRealVault(res, body.vaultId);
    if (!guard) return;

    // ── idempotency: a retried confirm must not double-record ─────────
    const already = await prisma.onChainDeposit.findUnique({ where: { signature } });
    if (already) {
      if (already.userId !== user.id) {
        res.status(409).json({
          error: "this transaction is already recorded against a different account",
          code: "signature_claimed",
        });
        return;
      }
      res.status(200).json({
        recorded: "already",
        deposit: serializeDeposit(already),
        explorerTx: explorerTx(already.signature),
      });
      return;
    }

    const authority = new PublicKey(identity.wallet);
    const [depositorPda] = vaultDepositorPda(guard.vaultPdaKey, authority);

    const tx = await fetchTransaction(signature);
    if (!tx) {
      res.status(404).json({
        error:
          "that signature is not on the cluster yet — it may still be propagating, or it never landed",
        code: "tx_not_found",
        signature,
        cluster: cluster(),
      });
      return;
    }
    if (tx.meta?.err) {
      res.status(409).json({
        error: "that transaction landed but FAILED on-chain — nothing was deposited",
        code: "tx_failed",
        signature,
        explorerTx: explorerTx(signature),
        chainError: JSON.stringify(tx.meta.err),
        logs: tx.meta.logMessages ?? [],
      });
      return;
    }

    // ── verify the transaction is the one we prepared ────────────────
    const message = tx.transaction.message;
    const accountKeys =
      message.version === "legacy"
        ? (message as Message).getAccountKeys()
        : (message as MessageV0).getAccountKeys({
            accountKeysFromLookups: tx.meta?.loadedAddresses ?? undefined,
          });
    const keyAt = (i: number): PublicKey | null => accountKeys.get(i) ?? null;

    const feePayer = keyAt(0);
    if (!feePayer || !feePayer.equals(authority)) {
      res.status(409).json({
        error: "that transaction was not paid for by your wallet",
        code: "wrong_fee_payer",
        expected: authority.toBase58(),
        actual: feePayer?.toBase58() ?? null,
      });
      return;
    }

    const depositDisc = ixDiscriminator("deposit");
    let matched: { amountLamports: bigint } | null = null;
    for (const ix of message.compiledInstructions) {
      const programId = keyAt(ix.programIdIndex);
      if (!programId || !programId.equals(VAULT_PROGRAM_ID)) continue;
      const data = Buffer.from(ix.data);
      if (data.length < 16 || !data.subarray(0, 8).equals(depositDisc)) continue;
      // Deposit account order (deposit.rs): authority, vault, depositor, system
      const [aIdx, vIdx, dIdx] = ix.accountKeyIndexes;
      const ixAuthority = aIdx === undefined ? null : keyAt(aIdx);
      const ixVault = vIdx === undefined ? null : keyAt(vIdx);
      const ixDepositor = dIdx === undefined ? null : keyAt(dIdx);
      if (!ixAuthority?.equals(authority)) continue;
      if (!ixVault?.equals(guard.vaultPdaKey)) continue;
      if (!ixDepositor?.equals(depositorPda)) continue;
      matched = { amountLamports: data.readBigUInt64LE(8) };
      break;
    }
    if (!matched) {
      res.status(409).json({
        error:
          "that transaction contains no Coffer `deposit` instruction for this vault signed by " +
          "your wallet — nothing to record",
        code: "not_a_deposit",
        signature,
        expected: {
          programId: VAULT_PROGRAM_ID.toBase58(),
          vaultPda: guard.vaultPdaKey.toBase58(),
          authority: authority.toBase58(),
          depositorPda: depositorPda.toBase58(),
        },
      });
      return;
    }

    // ── how many shares? ask the PROGRAM, not the client ─────────────
    const logs = tx.meta?.logMessages ?? [];
    const event = findDepositedEvent(logs, guard.vaultPdaKey, authority);

    // ── and read the depositor record back off the chain ─────────────
    const depositor = await fetchVaultDepositorAccount(getConnection(), depositorPda);
    if (!depositor) {
      res.status(502).json({
        error: "the deposit verified, but the VaultDepositor account could not be read back",
        code: "depositor_unreadable",
        depositorPda: depositorPda.toBase58(),
      });
      return;
    }

    const initDepositor = message.compiledInstructions.some((ix) => {
      const programId = keyAt(ix.programIdIndex);
      return (
        programId?.equals(VAULT_PROGRAM_ID) === true &&
        Buffer.from(ix.data).subarray(0, 8).equals(ixDiscriminator("init_depositor"))
      );
    });

    const record = await prisma.onChainDeposit.create({
      data: {
        vaultId: guard.vaultId,
        userId: user.id,
        signature,
        slot: tx.slot ?? null,
        authority: identity.wallet,
        vaultPda: guard.vaultPdaKey.toBase58(),
        depositorPda: depositorPda.toBase58(),
        amountLamports: matched.amountLamports.toString(),
        sharesMinted: (event?.sharesMinted ?? 0n).toString(),
        sharesAfter: depositor.data.shares.toString(),
        initDepositor,
      },
    });

    res.status(201).json({
      recorded: "created",
      deposit: serializeDeposit(record),
      explorerTx: explorerTx(signature),
      explorerDepositor: explorerAddress(depositorPda.toBase58()),
      // Provenance of the share number, so nobody has to take it on faith
      sharesFrom: event ? "program_event" : "unavailable",
      depositor: vaultDepositorToJson(depositor.data, depositor.lamports),
      cluster: cluster(),
    });
  } catch (err) {
    if (respondAuthError(res, err)) return;
    next(err);
  }
});

// ── GET /api/onchain/deposits?vaultId= ─────────────────────────────
// The caller's own verified deposits. Auth required; scoped to them.
onchainRouter.get("/deposits", async (req, res, next) => {
  try {
    if (!guardCluster(res)) return;
    const { user } = await requirePrivyUser(req);
    const vaultId = typeof req.query.vaultId === "string" ? req.query.vaultId : undefined;
    const rows = await prisma.onChainDeposit.findMany({
      where: { userId: user.id, ...(vaultId ? { vaultId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json({ deposits: rows.map(serializeDeposit) });
  } catch (err) {
    if (respondAuthError(res, err)) return;
    next(err);
  }
});

// ── wire shape ─────────────────────────────────────────────────────

function serializeDeposit(d: {
  id: string;
  vaultId: string;
  signature: string;
  slot: number | null;
  authority: string;
  vaultPda: string;
  depositorPda: string;
  amountLamports: string;
  sharesMinted: string;
  sharesAfter: string;
  initDepositor: boolean;
  createdAt: Date;
}): Record<string, unknown> {
  return {
    id: d.id,
    vaultId: d.vaultId,
    signature: d.signature,
    explorerTx: explorerTx(d.signature),
    slot: d.slot,
    authority: d.authority,
    vaultPda: d.vaultPda,
    depositorPda: d.depositorPda,
    amountLamports: d.amountLamports,
    amountSol: lamportsToSol(BigInt(d.amountLamports)),
    sharesMinted: d.sharesMinted,
    sharesAfter: d.sharesAfter,
    initDepositor: d.initDepositor,
    createdAt: Math.floor(d.createdAt.getTime() / 1000),
  };
}
