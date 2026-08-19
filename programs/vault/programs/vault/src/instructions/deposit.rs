//! Investor deposit: SOL in, shares out.
//!
//! Pricing invariant: shares are ALWAYS minted against effective equity
//! (posted NAV minus still-locked profit) BEFORE the deposit is added, using
//! the virtual-offset formula in math.rs (floor). NAV freshness is enforced so
//! nobody can buy shares against a mark the keeper has abandoned.

use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::errors::VaultError;
use crate::math;
use crate::state::*;

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut, seeds = [VAULT_SEED, vault.name.as_ref()], bump = vault.bump)]
    pub vault: Box<Account<'info, Vault>>,

    #[account(
        mut,
        seeds = [VAULT_DEPOSITOR_SEED, vault.key().as_ref(), authority.key().as_ref()],
        bump = depositor.bump,
    )]
    pub depositor: Box<Account<'info, VaultDepositor>>,

    pub system_program: Program<'info, System>,
}

pub fn handle_deposit(ctx: Context<Deposit>, amount_lamports: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let vault = &mut ctx.accounts.vault;
    let depositor = &mut ctx.accounts.depositor;

    // Deposits only into a healthy vault. (Withdrawals, by contrast, are
    // never status-gated — see withdraw.rs.)
    require!(vault.status == VaultStatus::Active, VaultError::VaultNotActive);
    // No depositor ops while a withdrawal request is pending (spec).
    require!(!depositor.has_pending_request(), VaultError::WithdrawRequestPending);
    require!(amount_lamports >= MIN_DEPOSIT_LAMPORTS, VaultError::DepositTooSmall);
    vault.assert_nav_fresh(now)?;

    // Price BEFORE the deposit lands.
    let equity = vault.effective_equity(now);
    // The vault always has seed equity, but a catastrophic 100% NAV loss could
    // zero it; refuse to mint infinite shares against nothing.
    require!(equity > 0, VaultError::ZeroEquity);

    let shares = math::shares_for_deposit(amount_lamports, vault.total_shares, equity)?;
    require!(shares > 0, VaultError::ZeroShares);

    // Global NAV cap preserves u128 headroom for all share math (state.rs).
    let new_nav = vault
        .nav_lamports
        .checked_add(amount_lamports)
        .ok_or(VaultError::MathOverflow)?;
    require!(new_nav <= MAX_NAV_LAMPORTS, VaultError::NavCapExceeded);

    // Inflow: user -> vault PDA lamports.
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.authority.to_account_info(),
                to: vault.to_account_info(),
            },
        ),
        amount_lamports,
    )?;

    // Bookkeeping. NAV grows by exactly the deposited lamports: the keeper
    // marks value changes, the program tracks flows.
    vault.total_shares = vault
        .total_shares
        .checked_add(shares)
        .ok_or(VaultError::MathOverflow)?;
    vault.nav_lamports = new_nav;

    depositor.shares = depositor
        .shares
        .checked_add(shares)
        .ok_or(VaultError::MathOverflow)?;
    depositor.net_deposits_lamports = depositor
        .net_deposits_lamports
        .checked_add(amount_lamports)
        .ok_or(VaultError::MathOverflow)?;

    // Manager co-invest tracking.
    if depositor.authority == vault.trader {
        vault.manager_shares = vault
            .manager_shares
            .checked_add(shares)
            .ok_or(VaultError::MathOverflow)?;
    }

    emit!(Deposited {
        vault: vault.key(),
        depositor: depositor.authority,
        amount_lamports,
        shares_minted: shares,
        total_shares: vault.total_shares,
        nav_lamports: vault.nav_lamports,
    });
    Ok(())
}
