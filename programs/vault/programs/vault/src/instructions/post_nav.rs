//! NAV keeper marks. Audit surface #2 (NAV bounds).
//!
//! The keeper is trusted to VALUE the book, but the program clamps how much
//! damage a compromised keeper can do per post:
//!   - only the appointed keeper key may post,
//!   - the mark's slot must be monotonic, not in the future, and recent,
//!   - |delta| per post is capped at max_nav_delta_bps of the previous NAV,
//!   - increases do not hit share pricing immediately — they drip in through
//!     the Meteora-style locked-profit unlock,
//!   - decreases hit share pricing IMMEDIATELY (losses are never smoothed —
//!     smoothing a loss would let withdrawers exit above fair value at the
//!     expense of everyone remaining),
//!   - keeper-posted losses feed the daily circuit breaker, which freezes
//!     TRADING (never withdrawals) when breached.
//!
//! Note on flows: nav_lamports is program-adjusted for deposits/withdrawals
//! between posts, so the keeper must always mark from current on-chain
//! holdings, not from its previous mark (a mark computed before a deposit
//! landed will look like a large negative delta and be rejected by the cap —
//! the correct failure mode).

use anchor_lang::prelude::*;

use crate::errors::VaultError;
use crate::state::*;

#[derive(Accounts)]
pub struct PostNav<'info> {
    // vault is declared before keeper so the keeper's address constraint can
    // reference it (constraint expressions should only look "up" the struct).
    #[account(mut, seeds = [VAULT_SEED, vault.name.as_ref()], bump = vault.bump)]
    pub vault: Box<Account<'info, Vault>>,

    #[account(address = vault.nav_keeper @ VaultError::InvalidNavKeeper)]
    pub keeper: Signer<'info>,
}

pub fn handle_post_nav(ctx: Context<PostNav>, nav_lamports: u64, mark_slot: u64) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;
    let vault = &mut ctx.accounts.vault;

    // ---- mark recency / monotonicity -------------------------------------
    require!(mark_slot > vault.nav_slot, VaultError::NavSlotNotMonotonic);
    require!(mark_slot <= clock.slot, VaultError::NavSlotNotMonotonic);
    require!(
        clock.slot.saturating_sub(mark_slot) <= MAX_NAV_MARK_AGE_SLOTS,
        VaultError::NavMarkTooOld
    );
    require!(nav_lamports <= MAX_NAV_LAMPORTS, VaultError::NavCapExceeded);

    // ---- per-post delta cap ----------------------------------------------
    let old_nav = vault.nav_lamports;
    let delta_cap = crate::math::mul_bps_floor(old_nav, vault.max_nav_delta_bps);
    let (gain, loss) = if nav_lamports >= old_nav {
        (nav_lamports - old_nav, 0u64)
    } else {
        (0u64, old_nav - nav_lamports)
    };
    require!(gain.max(loss) <= delta_cap, VaultError::NavDeltaTooLarge);

    // ---- daily loss bucket -----------------------------------------------
    // Roll the UTC day BEFORE applying this post, so day_start_equity is the
    // equity the day opened with.
    let today = now.div_euclid(SECONDS_PER_DAY);
    if vault.day_bucket != today {
        vault.day_bucket = today;
        vault.daily_loss_accumulator = 0;
        vault.day_start_equity = vault.effective_equity(now);
    }

    // ---- route the delta --------------------------------------------------
    let remaining_locked = vault.locked_profit_now(now);
    if gain > 0 {
        // Meteora relock: still-locked remainder + the new gain restart the
        // linear drip from now. Depositors/withdrawers price against
        // nav - locked, so the gain phases into the share price over
        // unlock_period_seconds instead of being sandwichable.
        vault.locked_profit = remaining_locked
            .checked_add(gain)
            .ok_or(VaultError::MathOverflow)?;
    } else {
        // Losses: locked profit is NOT used to absorb the loss (that would
        // hold the share price up artificially). We only clamp so that
        // effective equity (nav - locked) can never underflow below zero.
        vault.locked_profit = remaining_locked.min(nav_lamports);
        if loss > 0 {
            vault.daily_loss_accumulator = vault
                .daily_loss_accumulator
                .checked_add(loss)
                .ok_or(VaultError::MathOverflow)?;
        }
    }
    // The stored locked_profit was re-baselined either way; restart its clock.
    vault.locked_profit_ts = now;

    vault.nav_lamports = nav_lamports;
    vault.nav_slot = mark_slot;
    vault.nav_posted_at = now;

    // ---- circuit breaker --------------------------------------------------
    // Freezes TRADING only. Withdrawals ignore status by construction.
    let mut tripped = false;
    if vault.status == VaultStatus::Active && vault.daily_loss_breached(now) {
        vault.status = VaultStatus::Frozen;
        vault.frozen_by = FrozenBy::RiskBreaker;
        tripped = true;
    }

    emit!(NavPosted {
        vault: vault.key(),
        nav_lamports,
        nav_slot: mark_slot,
        locked_profit: vault.locked_profit,
        daily_loss_accumulator: vault.daily_loss_accumulator,
        frozen_by_breaker: tripped,
    });
    Ok(())
}
