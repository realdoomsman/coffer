//! SOL <-> wSOL plumbing and rent reclamation. Every move in this module is
//! VAULT-TO-VAULT: lamports travel between the vault PDA and token accounts
//! whose authority is the vault PDA. Nothing here can exfiltrate value.

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    close_account, sync_native, CloseAccount, SyncNative, TokenAccount, TokenInterface,
};

use crate::errors::VaultError;
use crate::instructions::withdraw::pay_from_vault;
use crate::state::*;

// ---------------------------------------------------------------------------
// wrap_sol: vault SOL -> vault wSOL ATA (trade float)
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct WrapSol<'info> {
    /// Trader or operator.
    pub authority: Signer<'info>,

    #[account(mut, seeds = [VAULT_SEED, vault.name.as_ref()], bump = vault.bump)]
    pub vault: Box<Account<'info, Vault>>,

    #[account(seeds = [PLATFORM_CONFIG_SEED], bump = platform_config.bump)]
    pub platform_config: Box<Account<'info, PlatformConfig>>,

    /// Vault-owned wSOL token account. (Anyone can create the vault's ATA
    /// permissionlessly via the Associated Token program — the vault program
    /// itself never needs to.)
    #[account(
        mut,
        token::authority = vault,
        constraint = wsol_account.mint == WSOL_MINT @ VaultError::NotWsol,
    )]
    pub wsol_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_wrap_sol(ctx: Context<WrapSol>, amount_lamports: u64) -> Result<()> {
    let vault_ai = ctx.accounts.vault.to_account_info();
    let vault = &ctx.accounts.vault;

    // Wrapping is trade preparation: it moves SOL out of the instant-withdraw
    // buffer into the trading float, so it is gated exactly like a trade.
    require!(vault.status == VaultStatus::Active, VaultError::VaultNotActive);
    require!(!ctx.accounts.platform_config.kill_switch, VaultError::TradingHalted);
    require!(
        vault.is_trade_authority(&ctx.accounts.authority.key()),
        VaultError::Unauthorized
    );
    require!(amount_lamports > 0, VaultError::InvalidParameter);

    // Only FREE SOL may be wrapped: never the rent floor, never lamports
    // reserved for pending withdrawal requests, never platform fees owed.
    let rent_min = Rent::get()?.minimum_balance(vault_ai.data_len());
    require!(
        vault.free_sol(vault_ai.lamports(), rent_min) >= amount_lamports,
        VaultError::InsufficientSolBuffer
    );

    // Vault PDA -> vault wSOL account (vault-to-vault), then sync so the
    // token amount reflects the new lamports.
    pay_from_vault(
        &vault_ai,
        &ctx.accounts.wsol_account.to_account_info(),
        amount_lamports,
    )?;
    sync_native(CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        SyncNative {
            account: ctx.accounts.wsol_account.to_account_info(),
        },
    ))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// unwrap_sol: close the vault wSOL account, ALL its lamports -> vault PDA
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct UnwrapSol<'info> {
    /// Trader or operator.
    pub authority: Signer<'info>,

    #[account(mut, seeds = [VAULT_SEED, vault.name.as_ref()], bump = vault.bump)]
    pub vault: Box<Account<'info, Vault>>,

    #[account(
        mut,
        token::authority = vault,
        constraint = wsol_account.mint == WSOL_MINT @ VaultError::NotWsol,
    )]
    pub wsol_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_unwrap_sol(ctx: Context<UnwrapSol>) -> Result<()> {
    let vault = &ctx.accounts.vault;
    // Deliberately NOT status-gated: returning float to the withdrawal buffer
    // must always be possible, frozen or not.
    require!(
        vault.is_trade_authority(&ctx.accounts.authority.key()),
        VaultError::Unauthorized
    );

    // SPL token allows closing a NATIVE account with a non-zero balance; the
    // destination receives rent + wrapped lamports in one move. Destination is
    // the vault PDA itself, so this is strictly vault-to-vault.
    let vault_name = vault.name;
    let vault_bump = vault.bump;
    let signer_seeds: &[&[u8]] = &[VAULT_SEED, vault_name.as_ref(), &[vault_bump]];
    close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.wsol_account.to_account_info(),
            destination: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        },
        &[signer_seeds],
    ))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// close_empty_ata: rent reclamation for zero-balance vault token accounts
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct CloseEmptyAta<'info> {
    /// Trader or operator.
    pub authority: Signer<'info>,

    #[account(mut, seeds = [VAULT_SEED, vault.name.as_ref()], bump = vault.bump)]
    pub vault: Box<Account<'info, Vault>>,

    /// Any vault-owned token account with a ZERO balance. Its rent lamports
    /// return to the vault PDA (they belong to the pool — the ATA rent was
    /// paid out of pocket by whoever created it, but reclaiming to the vault
    /// keeps the rule "vault custody only grows or pays withdrawals" simple
    /// and exfiltration-free).
    #[account(
        mut,
        token::authority = vault,
        constraint = token_account.amount == 0 @ VaultError::AtaNotEmpty,
    )]
    pub token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_close_empty_ata(ctx: Context<CloseEmptyAta>) -> Result<()> {
    let vault = &ctx.accounts.vault;
    require!(
        vault.is_trade_authority(&ctx.accounts.authority.key()),
        VaultError::Unauthorized
    );

    let vault_name = vault.name;
    let vault_bump = vault.bump;
    let signer_seeds: &[&[u8]] = &[VAULT_SEED, vault_name.as_ref(), &[vault_bump]];
    close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.token_account.to_account_info(),
            destination: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        },
        &[signer_seeds],
    ))?;
    Ok(())
}
