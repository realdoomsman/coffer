//! The trader's ONLY power over vault funds: routing a swap through Jupiter
//! v6 with the vault PDA as the signing authority. Audit surface #3.
//!
//! On-chain trust chain (the instruction data from Jupiter's /build endpoint
//! is treated as fully attacker-controlled):
//!   1. The CPI target is PINNED to Jupiter v6 — no other program can ever be
//!      invoked with the vault PDA's signature.
//!   2. Source and destination must be token accounts whose AUTHORITY is the
//!      vault PDA. Value can only move between vault-owned accounts.
//!   3. Every OTHER account passed to the CPI is scanned: any token account
//!      whose authority is the vault PDA (other than source/dest) is rejected,
//!      so crafted route data cannot quietly drain a third vault ATA that
//!      Jupiter was given signing rights over.
//!   4. Nothing from the instruction data is trusted for accounting: both
//!      token accounts are RELOADED after the CPI and the actual balance
//!      deltas are checked against max_in / min_out (this also prices in
//!      Token-2022 transfer fees, which make "amount sent" != "amount
//!      received").
//!   5. One leg must be the vault's wSOL account. Coffer vaults are
//!      SOL-denominated; forcing every trade through the SOL leg makes the
//!      per-trade notional cap verifiable ON-CHAIN from the wSOL delta,
//!      with no oracle. (Token-to-token = two trades through wSOL.)
//!   6. The vault PDA's own lamports are untouchable here: the account is
//!      owned by this program, and the runtime forbids any other program from
//!      debiting it.
//!
//! What is NOT enforced on-chain: max_price_impact_bps (no oracle in scope) —
//! it is enforced by the quoting engine off-chain; the on-chain backstops are
//! min_out, the notional cap, and the NAV-loss circuit breaker.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::token_interface::TokenAccount;

use crate::errors::VaultError;
use crate::state::*;

/// Byte offsets in the SPL token account layout (identical base layout in
/// Token-2022): mint [0..32], authority ("owner") [32..64], amount [64..72].
const TOKEN_ACCOUNT_AUTHORITY_OFFSET: usize = 32;
const TOKEN_ACCOUNT_BASE_LEN: usize = 165;
/// Token-2022 accounts longer than the base length carry an AccountType
/// discriminator byte immediately after it; 2 = Account.
const TOKEN_2022_ACCOUNT_TYPE_ACCOUNT: u8 = 2;

#[derive(Accounts)]
pub struct ExecuteSwap<'info> {
    /// Trader or appointed operator; validated in the handler.
    pub authority: Signer<'info>,

    #[account(mut, seeds = [VAULT_SEED, vault.name.as_ref()], bump = vault.bump)]
    pub vault: Box<Account<'info, Vault>>,

    /// Global kill switch lives here.
    #[account(seeds = [PLATFORM_CONFIG_SEED], bump = platform_config.bump)]
    pub platform_config: Box<Account<'info, PlatformConfig>>,

    /// CHECK: pinned to the Jupiter v6 program id; the only program the vault
    /// PDA will ever sign a CPI to.
    #[account(address = JUPITER_V6_PROGRAM_ID @ VaultError::InvalidJupiterProgram)]
    pub jupiter_program: UncheckedAccount<'info>,

    /// Vault-owned account the swap spends from.
    #[account(mut, token::authority = vault)]
    pub source_token: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Vault-owned account the swap pays into.
    #[account(mut, token::authority = vault)]
    pub dest_token: Box<InterfaceAccount<'info, TokenAccount>>,
    //
    // remaining_accounts: the COMPLETE account list of the Jupiter /build
    // instruction, in order. The vault PDA appears in it as Jupiter's "user
    // transfer authority"; we flip its is_signer on when re-building the
    // metas because the outer transaction cannot mark a PDA as a signer.
}

pub fn handle_execute_swap<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, ExecuteSwap<'info>>,
    data: Vec<u8>,
    max_in: u64,
    min_out: u64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let vault_key = ctx.accounts.vault.key();
    let source_key = ctx.accounts.source_token.key();
    let dest_key = ctx.accounts.dest_token.key();

    // ---- gates ------------------------------------------------------------
    {
        let vault = &ctx.accounts.vault;
        require!(vault.status == VaultStatus::Active, VaultError::VaultNotActive);
        require!(!ctx.accounts.platform_config.kill_switch, VaultError::TradingHalted);
        require!(
            vault.is_trade_authority(&ctx.accounts.authority.key()),
            VaultError::Unauthorized
        );
        // Belt-and-suspenders: post_nav freezes on breach, but if the breaker
        // tripped in this very day-bucket, refuse regardless of status.
        require!(!vault.daily_loss_breached(now), VaultError::DailyLossBreached);

        require!(source_key != dest_key, VaultError::SameTokenAccount);
        require!(
            ctx.accounts.source_token.mint != ctx.accounts.dest_token.mint,
            VaultError::SameTokenAccount
        );
        // wSOL leg requirement (see module docs, point 5).
        let source_is_wsol = ctx.accounts.source_token.mint == WSOL_MINT;
        let dest_is_wsol = ctx.accounts.dest_token.mint == WSOL_MINT;
        require!(source_is_wsol || dest_is_wsol, VaultError::MissingWsolLeg);

        // Optional mint allowlist on the non-SOL leg.
        if vault.enforce_mint_allowlist {
            let other_mint = if source_is_wsol {
                ctx.accounts.dest_token.mint
            } else {
                ctx.accounts.source_token.mint
            };
            require!(
                vault.allowed_mints.contains(&other_mint),
                VaultError::MintNotAllowed
            );
        }

        require!(min_out > 0, VaultError::ZeroMinOut);
        require!(max_in > 0, VaultError::InvalidParameter);
        // Anchor-style discriminator must at least be present.
        require!(data.len() >= 8, VaultError::InvalidParameter);
    }

    // ---- scan remaining accounts for third vault-owned token accounts ----
    // WHY: Jupiter executes attacker-controlled route data with the vault
    // PDA's signature. If a third vault-owned ATA were in the account list,
    // that data could move its balance out. Only source/dest may appear.
    for acc in ctx.remaining_accounts.iter() {
        let key = acc.key();
        if key == source_key || key == dest_key {
            continue;
        }
        let owner_program = *acc.owner;
        if owner_program == anchor_spl::token::ID || owner_program == anchor_spl::token_2022::ID {
            let data_ref = acc.try_borrow_data()?;
            if data_ref.len() >= TOKEN_ACCOUNT_BASE_LEN {
                // Base-size = classic token account; longer = Token-2022 with
                // extensions, identified by the AccountType byte. (A classic
                // multisig is 355 bytes and could false-positive on the type
                // byte, but then its bytes 32..64 would additionally have to
                // equal the vault PDA — cryptographically negligible, and the
                // failure mode is a safe reject.)
                let is_token_account = data_ref.len() == TOKEN_ACCOUNT_BASE_LEN
                    || data_ref[TOKEN_ACCOUNT_BASE_LEN] == TOKEN_2022_ACCOUNT_TYPE_ACCOUNT;
                if is_token_account {
                    let authority = Pubkey::try_from(
                        &data_ref
                            [TOKEN_ACCOUNT_AUTHORITY_OFFSET..TOKEN_ACCOUNT_AUTHORITY_OFFSET + 32],
                    )
                    .map_err(|_| error!(VaultError::ForeignVaultTokenAccount))?;
                    require!(authority != vault_key, VaultError::ForeignVaultTokenAccount);
                }
            }
        }
    }

    // ---- snapshot balances ------------------------------------------------
    let source_before = ctx.accounts.source_token.amount;
    let dest_before = ctx.accounts.dest_token.amount;

    // ---- build + invoke the pinned CPI ------------------------------------
    let metas: Vec<AccountMeta> = ctx
        .remaining_accounts
        .iter()
        .map(|acc| AccountMeta {
            pubkey: acc.key(),
            // The vault PDA signs via invoke_signed; every other account
            // keeps the signer privilege it arrived with.
            is_signer: acc.key() == vault_key || acc.is_signer,
            is_writable: acc.is_writable,
        })
        .collect();

    let ix = Instruction {
        program_id: JUPITER_V6_PROGRAM_ID,
        accounts: metas,
        data,
    };

    // invoke_signed needs every referenced account (and the target program)
    // present in the infos slice.
    let mut infos: Vec<AccountInfo<'info>> =
        Vec::with_capacity(ctx.remaining_accounts.len() + 1);
    infos.push(ctx.accounts.jupiter_program.to_account_info());
    infos.extend(ctx.remaining_accounts.iter().cloned());

    let vault_name = ctx.accounts.vault.name;
    let vault_bump = ctx.accounts.vault.bump;
    let signer_seeds: &[&[u8]] = &[VAULT_SEED, vault_name.as_ref(), &[vault_bump]];
    invoke_signed(&ix, &infos, &[signer_seeds])?;

    // ---- verify actual balance deltas (never trust instruction data) ------
    ctx.accounts.source_token.reload()?;
    ctx.accounts.dest_token.reload()?;
    let source_after = ctx.accounts.source_token.amount;
    let dest_after = ctx.accounts.dest_token.amount;

    // Source may only decrease (a swap never pays into its own source), and
    // by at most max_in.
    let in_delta = source_before
        .checked_sub(source_after)
        .ok_or(VaultError::MaxInExceeded)?;
    require!(in_delta <= max_in, VaultError::MaxInExceeded);

    // Destination must have received at least min_out — measured on the
    // vault's account, POST transfer fees.
    let out_delta = dest_after
        .checked_sub(dest_before)
        .ok_or(VaultError::SlippageExceeded)?;
    require!(out_delta >= min_out, VaultError::SlippageExceeded);

    // Per-trade notional cap, measured on whichever leg is wSOL. Note that
    // capping the receive side too means unwinding an oversized position
    // takes multiple trades — accepted: predictable clip sizes are the point.
    let vault = &ctx.accounts.vault;
    let wsol_delta = if ctx.accounts.source_token.mint == WSOL_MINT {
        in_delta
    } else {
        out_delta
    };
    require!(
        wsol_delta <= vault.max_trade_notional_lamports,
        VaultError::NotionalTooLarge
    );

    emit!(SwapExecuted {
        vault: vault_key,
        authority: ctx.accounts.authority.key(),
        source_mint: ctx.accounts.source_token.mint,
        dest_mint: ctx.accounts.dest_token.mint,
        in_delta,
        out_delta,
    });
    Ok(())
}
