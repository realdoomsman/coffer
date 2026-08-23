//! Platform-level operations: global kill switch, NAV keeper rotation,
//! platform fee collection and treasury sweep.

use anchor_lang::prelude::*;

use crate::errors::VaultError;
use crate::instructions::withdraw::pay_from_vault;
use crate::state::*;

// ---------------------------------------------------------------------------
// Contexts
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct AdminPlatformOp<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [PLATFORM_CONFIG_SEED],
        bump = platform_config.bump,
        has_one = admin @ VaultError::Unauthorized,
    )]
    pub platform_config: Account<'info, PlatformConfig>,
}

#[derive(Accounts)]
pub struct SetNavKeeper<'info> {
    pub admin: Signer<'info>,

    #[account(
        seeds = [PLATFORM_CONFIG_SEED],
        bump = platform_config.bump,
        has_one = admin @ VaultError::Unauthorized,
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    #[account(mut, seeds = [VAULT_SEED, vault.name.as_ref()], bump = vault.bump)]
    pub vault: Box<Account<'info, Vault>>,
}

#[derive(Accounts)]
pub struct CollectPlatformFees<'info> {
    #[account(mut, seeds = [VAULT_SEED, vault.name.as_ref()], bump = vault.bump)]
    pub vault: Box<Account<'info, Vault>>,

    #[account(seeds = [PLATFORM_CONFIG_SEED], bump = platform_config.bump)]
    pub platform_config: Account<'info, PlatformConfig>,

    /// The ONLY destination fees can ever be collected to: the seed-pinned
    /// Treasury PDA. There is no account or argument through which a caller
    /// could redirect this.
    #[account(mut, seeds = [TREASURY_SEED], bump = platform_config.treasury_bump)]
    pub treasury: Account<'info, Treasury>,
}

#[derive(Accounts)]
pub struct SweepTreasury<'info> {
    pub admin: Signer<'info>,

    #[account(
        seeds = [PLATFORM_CONFIG_SEED],
        bump = platform_config.bump,
        has_one = admin @ VaultError::Unauthorized,
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    #[account(mut, seeds = [TREASURY_SEED], bump = platform_config.treasury_bump)]
    pub treasury: Account<'info, Treasury>,

    /// CHECK: admin-chosen destination for PLATFORM (never vault) funds.
    #[account(mut)]
    pub destination: UncheckedAccount<'info>,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// Global kill switch: halts NEW trades (and trade-prep wraps) on every
/// vault. By construction it cannot touch withdrawals — no withdrawal-path
/// instruction reads it.
pub fn handle_set_kill_switch(ctx: Context<AdminPlatformOp>, on: bool) -> Result<()> {
    ctx.accounts.platform_config.kill_switch = on;
    Ok(())
}

/// NAV keeper rotation, platform-admin only.
/// WHY admin and not trader: the keeper's marks price every share; a
/// trader-appointed keeper could mark the trader's own book up.
/// WHY this must exist at all: deposits/withdrawals are gated on NAV
/// freshness, so a dead keeper key would otherwise brick withdrawals — the
/// platform restores liveness by rotating to a working keeper.
pub fn handle_set_nav_keeper(ctx: Context<SetNavKeeper>, new_keeper: Pubkey) -> Result<()> {
    require!(new_keeper != Pubkey::default(), VaultError::InvalidParameter);
    // FIX — the liveness argument above justifies rotating a DEAD keeper back
    // to the platform. It does not justify pointing a live vault's pricing at
    // an arbitrary key: admin could name any address and drain that vault
    // through the same NAV path a creator could. Rotation is now only ever
    // TO the admin, which is the one key already trusted to price books.
    require!(
        new_keeper == ctx.accounts.platform_config.admin,
        VaultError::Unauthorized
    );
    ctx.accounts.vault.nav_keeper = new_keeper;
    Ok(())
}

/// Permissionless: anyone may push accrued platform fees from a vault to the
/// pinned treasury. Safe to open up because the destination is fixed by
/// seeds and the amount is fixed by the vault's own accounting.
pub fn handle_collect_platform_fees(ctx: Context<CollectPlatformFees>) -> Result<()> {
    let vault_ai = ctx.accounts.vault.to_account_info();
    let vault = &mut ctx.accounts.vault;

    let owed = vault.platform_fees_owed_lamports;
    require!(owed > 0, VaultError::NoFeesOwed);

    // The owed lamports are always physically present: every spend path
    // (withdrawals, wraps) excludes them via free_sol. The min() below is
    // pure defense-in-depth so an accounting bug could never turn into a
    // withdrawal-blocking rent violation.
    let rent_min = Rent::get()?.minimum_balance(vault_ai.data_len());
    let physically_available = vault_ai
        .lamports()
        .saturating_sub(rent_min)
        .saturating_sub(vault.pending_withdraw_value_lamports);
    let amount = owed.min(physically_available);
    require!(amount > 0, VaultError::NoFeesOwed);

    vault.platform_fees_owed_lamports = vault
        .platform_fees_owed_lamports
        .checked_sub(amount)
        .ok_or(VaultError::MathOverflow)?;

    pay_from_vault(&vault_ai, &ctx.accounts.treasury.to_account_info(), amount)?;
    Ok(())
}

/// Moves PLATFORM fee revenue (never vault assets) out of the treasury.
/// Admin-gated; keeps the treasury rent-exempt.
pub fn handle_sweep_treasury(ctx: Context<SweepTreasury>, amount: u64) -> Result<()> {
    let treasury_ai = ctx.accounts.treasury.to_account_info();
    let rent_min = Rent::get()?.minimum_balance(treasury_ai.data_len());
    let available = treasury_ai.lamports().saturating_sub(rent_min);
    require!(amount > 0 && amount <= available, VaultError::InvalidParameter);

    // Treasury is program-owned, so the same direct-lamport pattern applies.
    pay_from_vault(&treasury_ai, &ctx.accounts.destination.to_account_info(), amount)?;
    Ok(())
}
