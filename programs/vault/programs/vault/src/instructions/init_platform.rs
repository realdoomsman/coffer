//! One-time platform bootstrap: creates the PlatformConfig and the Treasury
//! PDA. Gated to the program UPGRADE AUTHORITY so the ["platform_config"]
//! seed cannot be squatted by a front-runner on deploy.

use anchor_lang::prelude::*;

use crate::errors::VaultError;
use crate::state::*;

#[derive(Accounts)]
pub struct InitPlatform<'info> {
    /// Becomes the platform admin. Must be the current program upgrade
    /// authority (see program_data constraint below).
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + PlatformConfig::INIT_SPACE,
        seeds = [PLATFORM_CONFIG_SEED],
        bump
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    /// The pinned lamport sink for platform fees. Empty state; only ever
    /// addressed via these seeds, so `collect_platform_fees` cannot be pointed
    /// anywhere else.
    #[account(
        init,
        payer = admin,
        space = 8 + Treasury::INIT_SPACE,
        seeds = [TREASURY_SEED],
        bump
    )]
    pub treasury: Account<'info, Treasury>,

    /// This program's ProgramData account (upgradeable loader). Declared
    /// before `program` so the latter's constraint can reference it.
    #[account(constraint = program_data.upgrade_authority_address == Some(admin.key()) @ VaultError::Unauthorized)]
    pub program_data: Account<'info, ProgramData>,

    /// This program, as deployed by the upgradeable loader.
    /// NOTE(api): `programdata_address()` and the `ProgramData` account type
    /// are the documented Anchor pattern for "only the deployer may call".
    /// It requires the program to be deployed with the upgradeable loader
    /// (anchor deploy / anchor test both do this).
    #[account(constraint = program.programdata_address()? == Some(program_data.key()) @ VaultError::InvalidProgramData)]
    pub program: Program<'info, crate::program::Vault>,

    pub system_program: Program<'info, System>,
}

pub fn handle_init_platform(ctx: Context<InitPlatform>) -> Result<()> {
    let cfg = &mut ctx.accounts.platform_config;
    cfg.bump = ctx.bumps.platform_config;
    cfg.treasury_bump = ctx.bumps.treasury;
    cfg.admin = ctx.accounts.admin.key();
    cfg.kill_switch = false;
    Ok(())
}
