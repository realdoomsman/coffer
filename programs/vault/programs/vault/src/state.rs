//! Account state for the Coffer vault program.
//!
//! CUSTODY MODEL (the single most important invariant in this file):
//! The `Vault` PDA is the owner of everything — it holds the SOL deposits as
//! lamports on its own account, and it is the authority on every token
//! account the vault trades through. The trader never holds a delegated key.
//! The ONLY instructions that move value from vault custody to a non-vault
//! account are the investor withdrawal instructions (which also pay the
//! crystallized performance fee) and `collect_platform_fees` (which can pay
//! only to the pinned Treasury PDA). Everything else is either an inflow or a
//! vault-to-vault move (SOL <-> vault wSOL ATA).

use anchor_lang::prelude::*;

// ---------------------------------------------------------------------------
// Seeds
// ---------------------------------------------------------------------------
pub const VAULT_SEED: &[u8] = b"vault";
pub const VAULT_DEPOSITOR_SEED: &[u8] = b"vault_depositor";
pub const PLATFORM_CONFIG_SEED: &[u8] = b"platform_config";
pub const TREASURY_SEED: &[u8] = b"treasury";

// ---------------------------------------------------------------------------
// Pinned external programs / mints
// ---------------------------------------------------------------------------
// Resolved at first build: neither `anchor_lang::solana_program::pubkey!`
// nor `Pubkey::from_str_const` (solana >= 2.0) is reachable on this stack
// (anchor 0.30.1 / solana-program 1.18.26), so these are const byte arrays
// decoded from the base58 shown beside each. Version-independent, and the
// tests assert they round-trip back to these exact addresses.
/// Jupiter Aggregator v6. execute_swap refuses to CPI anywhere else.
pub const JUPITER_V6_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
        4, 121, 213, 91, 242, 49, 192, 110,
        238, 116, 197, 110, 206, 104, 21, 7,
        253, 177, 178, 222, 163, 244, 142, 81,
        2, 177, 205, 162, 86, 188, 19, 143,
]); // JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4
/// Native (wrapped) SOL mint.
pub const WSOL_MINT: Pubkey = Pubkey::new_from_array([
        6, 155, 136, 87, 254, 171, 129, 132,
        251, 104, 127, 99, 70, 24, 192, 53,
        218, 196, 57, 220, 26, 235, 59, 85,
        152, 160, 240, 0, 0, 0, 0, 1,
]); // So11111111111111111111111111111111111111112

// ---------------------------------------------------------------------------
// Economic constants
// ---------------------------------------------------------------------------
/// Platform's share of crystallized profit, in bps. Constant by spec (10%).
pub const PLATFORM_PROFIT_BPS: u16 = 1_000;
pub const BPS_DENOMINATOR: u128 = 10_000;

/// Decimal-offset ("virtual shares") anti-inflation protection, the
/// OpenZeppelin ERC-4626 pattern: pricing always behaves as if
/// `VIRTUAL_SHARES` shares backed by `VIRTUAL_LAMPORTS` lamports already
/// exist. WHY: makes the classic first-depositor share-price inflation attack
/// (donate assets to inflate price, round victims' mints down to 0) lose money
/// at a 1000:1 ratio for the attacker instead of profiting.
pub const VIRTUAL_SHARES: u128 = 1_000;
pub const VIRTUAL_LAMPORTS: u128 = 1;

/// Creator's mandatory seed deposit at init_vault. These shares are recorded
/// in `Vault::seed_shares` and owned by NOBODY (economically burned).
/// WHY: a permanently-locked non-zero share supply means share price can never
/// be reset by fully emptying the vault, closing the second inflation-attack
/// door the virtual offset alone leaves ajar.
pub const MIN_SEED_LAMPORTS: u64 = 10_000_000; // 0.01 SOL

/// Dust guard on deposits.
pub const MIN_DEPOSIT_LAMPORTS: u64 = 1_000;

/// perf fee must be inside [1000, 3000] bps at init, and afterwards may only
/// ever DECREASE (reduce_fees). Floor after init is 0.
pub const MIN_PERF_FEE_BPS_AT_INIT: u16 = 1_000;
pub const MAX_PERF_FEE_BPS: u16 = 3_000;

pub const SECONDS_PER_DAY: i64 = 86_400;
pub const MAX_REDEEM_WINDOW_SECONDS: i64 = 30 * SECONDS_PER_DAY;
pub const MAX_UNLOCK_PERIOD_SECONDS: i64 = 7 * SECONDS_PER_DAY;

/// Bounds on the configurable NAV staleness window used to gate
/// deposits/withdrawals.
pub const MIN_NAV_STALENESS_SECONDS: i64 = 60;
pub const MAX_NAV_STALENESS_SECONDS: i64 = SECONDS_PER_DAY;

/// Instant withdrawals additionally require the NAV to be at most this old,
/// regardless of the vault's configured staleness window. WHY: instant
/// withdrawals skip the redeem window, so a stale mark is directly arbitrable
/// against remaining depositors.
pub const INSTANT_WITHDRAW_MAX_NAV_STALENESS_SECONDS: i64 = 300;

/// How long the posted NAV must have been stale before the permissionless
/// emergency withdrawal path (`emergency_withdraw`) opens.
/// WHY it exists: every normal withdrawal path gates on `assert_nav_fresh`, so
/// a keeper that stops posting — or a platform that declines to rotate it —
/// would otherwise freeze withdrawal ENTITLEMENT indefinitely. Entitlement
/// must never depend on a live keeper, a responsive admin or a cooperative
/// trader; that is the platform's core promise.
/// WHY 7 days: the configurable window tops out at MAX_NAV_STALENESS_SECONDS
/// (1 day), so a full week of silence is unambiguously an abandoned keeper
/// rather than a late post, and it leaves the platform ample time to rotate
/// the keeper (platform.rs::set_nav_keeper) before anyone has to exit on an
/// old mark. It is also >= MAX_UNLOCK_PERIOD_SECONDS, so by the time this path
/// opens the locked-profit drip has always fully unlocked.
pub const NAV_EMERGENCY_GRACE_SECONDS: i64 = 7 * SECONDS_PER_DAY;

/// Haircut applied to the GROSS value of shares redeemed against a stale mark
/// through `emergency_withdraw`, before any fee crystallization.
/// WHY: a week-old mark is not a fair price, and it is the ONE price this path
/// can use. The haircut makes exiting on it strictly worse than waiting for a
/// fresh post (so nobody can farm the escape hatch or arbitrage a stale-high
/// mark), and the withheld lamports stay in NAV backing the shares that
/// remain — the emergency exit is paid for by the depositor who takes it.
pub const EMERGENCY_HAIRCUT_BPS: u16 = 500; // 5%

/// Complement of EMERGENCY_HAIRCUT_BPS: the fraction of the stale-mark gross
/// an emergency withdrawer is actually paid. Derived rather than written twice
/// so the two can never drift apart, and used directly by the payout math so
/// the rounding dust falls to the pool (see math.rs's rounding policy).
pub const EMERGENCY_PAYOUT_BPS: u16 = 10_000 - EMERGENCY_HAIRCUT_BPS;

/// Bounds on the per-post NAV delta cap (bps of previous NAV).
pub const MIN_NAV_DELTA_BPS: u16 = 100; // 1%
pub const MAX_NAV_DELTA_BPS: u16 = 5_000; // 50%

/// A NAV mark must have been computed at a slot at most this far behind the
/// slot at which post_nav executes (~5 minutes at 400ms slots). WHY: prevents
/// the keeper replaying an old favorable mark as if it were fresh.
pub const MAX_NAV_MARK_AGE_SLOTS: u64 = 750;

/// Global cap on posted NAV (10M SOL). WHY: guarantees u128 headroom for
/// `shares * equity` products everywhere in share math:
/// max total_shares ~= MAX_NAV * VIRTUAL_SHARES = 1e19, times MAX_NAV = 1e35,
/// comfortably below u128::MAX (~3.4e38).
pub const MAX_NAV_LAMPORTS: u64 = 10_000_000_000_000_000;

pub const MAX_ALLOWED_MINTS: usize = 8;

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum VaultType {
    /// Trader manages positions by hand.
    Managed,
    /// Positions are mirrored by an off-chain engine via the `operator` key.
    Mirror,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum VaultStatus {
    Active,
    /// Trading (and new deposits) disabled. Withdrawals ALWAYS keep working —
    /// no instruction in this program checks Frozen/Closed on the withdrawal
    /// path (only NAV freshness, which the platform can restore by rotating
    /// the keeper, and which `emergency_withdraw` bypasses entirely after
    /// NAV_EMERGENCY_GRACE_SECONDS so entitlement never depends on anyone).
    Frozen,
    /// Terminal: trading and deposits permanently disabled, withdrawals only.
    Closed,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum FrozenBy {
    None,
    Trader,
    /// Frozen by platform admin — only the platform may unfreeze.
    Platform,
    /// Frozen by the daily-loss circuit breaker. The trader may unfreeze only
    /// after the UTC day rolls over; the platform may unfreeze any time (and
    /// doing so resets the day's loss accumulator).
    RiskBreaker,
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

/// Global platform config. PDA: ["platform_config"].
#[account]
#[derive(InitSpace)]
pub struct PlatformConfig {
    pub bump: u8,
    pub treasury_bump: u8,
    /// Platform admin. Set at init_platform, which is gated to the program
    /// upgrade authority, so this cannot be squatted by a front-runner.
    pub admin: Pubkey,
    /// Platform-wide kill switch. Freezes NEW trades (and trade-prep wraps)
    /// across every vault. DELIBERATELY consulted by no withdrawal-path
    /// instruction: the platform must never be able to trap investor funds.
    pub kill_switch: bool,
}

/// Lamport sink for platform fees. PDA: ["treasury"]. Owned by this program;
/// carries no state beyond the discriminator. `collect_platform_fees` can pay
/// only to this address because the account is constrained by seeds.
#[account]
#[derive(InitSpace)]
pub struct Treasury {}

/// One withdrawal request. `shares == 0` means "no pending request".
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace)]
pub struct WithdrawRequest {
    pub shares: u128,
    /// Share value at request time. Final payout is
    /// min(value_at_request, value_at_execution) — the "worse-of" rule, so a
    /// depositor can never lock in a stale high price by requesting early.
    pub value_at_request_lamports: u64,
    pub requested_at: i64,
}

/// A trader's vault. PDA: ["vault", name]. This account also physically holds
/// the vault's SOL as lamports on itself.
#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub bump: u8,
    /// Fixed 32-byte name; part of the PDA seeds, so globally unique.
    pub name: [u8; 32],
    /// The trader. Has NO custody: the only powers this key carries are
    /// execute_swap / wrap / unwrap / close_empty_ata / admin-of-own-vault.
    pub trader: Pubkey,
    /// Optional delegated trading key (mirror engine). Pubkey::default = unset.
    /// Holds exactly the trader's trade-only powers, nothing more.
    pub operator: Pubkey,
    /// Key allowed to post NAV marks. Appointed at init; rotatable ONLY by the
    /// platform admin (NOT the trader — a trader-controlled keeper could mark
    /// its own book and mint itself profit).
    pub nav_keeper: Pubkey,
    pub vault_type: VaultType,
    pub status: VaultStatus,
    pub frozen_by: FrozenBy,

    // -- fees ---------------------------------------------------------------
    /// Performance fee in bps of crystallized profit. Only decreasable.
    pub perf_fee_bps: u16,
    /// Snapshot of PLATFORM_PROFIT_BPS (constant, stored for indexers).
    pub platform_profit_bps: u16,

    // -- withdrawal timing / NAV freshness ----------------------------------
    pub redeem_window_seconds: i64,
    /// Deposits/withdrawals revert when now - nav_posted_at exceeds this.
    pub nav_staleness_seconds: i64,

    // -- share supply -------------------------------------------------------
    /// Total real shares outstanding (virtual shares are NOT included here;
    /// they exist only inside the pricing formulas).
    pub total_shares: u128,
    /// Creator's seed shares. Included in total_shares, owned by nobody,
    /// never redeemable — see MIN_SEED_LAMPORTS.
    pub seed_shares: u128,
    /// Shares held by the trader's own depositor account (manager co-invest).
    pub manager_shares: u128,

    // -- posted NAV ---------------------------------------------------------
    /// Maintained NAV in lamports: last keeper mark, adjusted by the program
    /// for every deposit (+) and withdrawal (-) since, so it is always the
    /// current best estimate of total vault value. Platform fees owed are
    /// already EXCLUDED (nav is reduced by the gross withdrawal value while
    /// the platform-fee lamports physically remain on the vault).
    pub nav_lamports: u64,
    /// Slot the keeper computed the last mark at (monotonic).
    pub nav_slot: u64,
    /// Unix time post_nav last ran (freshness gate for deposits/withdrawals).
    pub nav_posted_at: i64,

    // -- locked-profit drip (Meteora pattern) -------------------------------
    /// Profit still locked as of `locked_profit_ts`. NAV increases posted by
    /// the keeper land here and unlock linearly over unlock_period_seconds.
    /// WHY: without the drip, a depositor could sandwich a known-good NAV
    /// post (deposit right before, withdraw right after) and skim the jump.
    pub locked_profit: u64,
    pub locked_profit_ts: i64,
    pub unlock_period_seconds: i64,

    // -- NAV posting guards -------------------------------------------------
    /// Max |delta| per post as bps of previous NAV.
    pub max_nav_delta_bps: u16,

    // -- risk params --------------------------------------------------------
    /// Per-trade cap on the wSOL leg of a swap. u64::MAX = uncapped.
    pub max_trade_notional_lamports: u64,
    /// Advisory bound enforced by the off-chain engine when quoting (there is
    /// no on-chain oracle here to verify realized impact; the on-chain
    /// defenses are min_out + balance-delta checks + the NAV loss breaker).
    pub max_price_impact_bps: u16,
    /// Daily NAV-loss circuit breaker threshold, bps of day-start equity.
    /// 0 = disabled.
    pub daily_loss_limit_bps: u16,
    /// Keeper-posted NAV losses accumulated during `day_bucket`.
    pub daily_loss_accumulator: u64,
    /// unix_timestamp / 86400 of the accumulator's day.
    pub day_bucket: i64,
    /// Effective equity at the first post_nav of the day; the breaker
    /// threshold base.
    pub day_start_equity: u64,

    // -- SOL buffer accounting ----------------------------------------------
    /// Sum of value_at_request over all pending withdrawal requests. These
    /// lamports are RESERVED: wrap_sol and instant_withdraw cannot spend them.
    pub pending_withdraw_value_lamports: u64,
    /// Sum of shares over all pending withdrawal requests (bookkeeping).
    pub pending_withdraw_shares: u128,
    /// Platform fees crystallized but not yet swept to the treasury. These
    /// lamports sit on the vault but are excluded from NAV and from the
    /// spendable buffer.
    pub platform_fees_owed_lamports: u64,

    // -- mint allowlist -----------------------------------------------------
    /// When true, the non-SOL side of every swap must be in allowed_mints.
    /// Defense-in-depth against fat-fingered/rug-ish long-tail mints; managed
    /// by the trader, so it is NOT a trust boundary against the trader.
    pub enforce_mint_allowlist: bool,
    /// Pubkey::default() entries are empty slots.
    pub allowed_mints: [Pubkey; 8],

    /// Reserved for future upgrades without realloc.
    pub padding: [u8; 64],
}

impl Vault {
    /// Locked profit remaining right now (linear drip).
    /// ROUNDING: ceil — keeps MORE profit locked, i.e. prices shares LOWER.
    /// This is conservative for the pool on the withdrawal path (payouts are
    /// computed on the lower equity). On the deposit path the same lower
    /// equity mints dust-level extra shares; that is bounded by 1 lamport of
    /// equity and absorbed by the virtual-share offset. See math.rs.
    pub fn locked_profit_now(&self, now: i64) -> u64 {
        crate::math::locked_profit_remaining(
            self.locked_profit,
            self.locked_profit_ts,
            self.unlock_period_seconds,
            now,
        )
    }

    /// Equity used for ALL share pricing = posted NAV minus still-locked
    /// profit. Platform fees owed are already excluded from nav_lamports.
    pub fn effective_equity(&self, now: i64) -> u64 {
        self.nav_lamports.saturating_sub(self.locked_profit_now(now))
    }

    pub fn assert_nav_fresh(&self, now: i64) -> Result<()> {
        require!(
            now.saturating_sub(self.nav_posted_at) <= self.nav_staleness_seconds,
            crate::errors::VaultError::NavStale
        );
        Ok(())
    }

    /// Lamports on the vault that are actually spendable (for wrapping into
    /// the trading float or paying an instant withdrawal), i.e. NOT:
    ///   - the vault account's own rent-exempt minimum,
    ///   - lamports reserved for pending withdrawal requests,
    ///   - platform fees owed to the treasury.
    /// WHY: every outflow path must run through this so one flow can never
    /// spend lamports another flow is entitled to.
    pub fn free_sol(&self, vault_account_lamports: u64, rent_exempt_min: u64) -> u64 {
        vault_account_lamports
            .saturating_sub(rent_exempt_min)
            .saturating_sub(self.pending_withdraw_value_lamports)
            .saturating_sub(self.platform_fees_owed_lamports)
    }

    pub fn is_trade_authority(&self, key: &Pubkey) -> bool {
        *key == self.trader || (self.operator != Pubkey::default() && *key == self.operator)
    }

    pub fn daily_loss_threshold(&self) -> u64 {
        // ROUNDING: floor — a lower threshold trips the breaker EARLIER,
        // which favors the pool.
        crate::math::mul_bps_floor(self.day_start_equity, self.daily_loss_limit_bps)
    }

    /// True when the daily breaker is configured and today's accumulated
    /// keeper-posted losses exceed the threshold.
    pub fn daily_loss_breached(&self, now: i64) -> bool {
        self.daily_loss_limit_bps > 0
            && self.day_bucket == now.div_euclid(SECONDS_PER_DAY)
            && self.daily_loss_accumulator > self.daily_loss_threshold()
    }
}

/// Per (vault, user) deposit account. PDA: ["vault_depositor", vault, user].
#[account]
#[derive(InitSpace)]
pub struct VaultDepositor {
    pub bump: u8,
    pub vault: Pubkey,
    pub authority: Pubkey,
    pub shares: u128,
    /// Principal: lamports deposited minus principal returned. Reduced
    /// proportionally (by share fraction) on every withdrawal, so the
    /// remaining position always keeps its pro-rata cost basis.
    pub net_deposits_lamports: u64,
    /// Lifetime profit crystallized (fee'd) for this depositor. Monotone
    /// ratchet — the per-depositor high-water record in the Drift pattern.
    /// See withdraw.rs for how the exit-realization scheme uses it.
    pub cumulative_profit_share_lamports: u64,
    pub last_withdraw_request: WithdrawRequest,
    pub padding: [u8; 32],
}

impl VaultDepositor {
    pub fn has_pending_request(&self) -> bool {
        self.last_withdraw_request.shares != 0
    }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[event]
pub struct VaultInitialized {
    pub vault: Pubkey,
    pub trader: Pubkey,
    pub seed_lamports: u64,
    pub seed_shares: u128,
}

#[event]
pub struct Deposited {
    pub vault: Pubkey,
    pub depositor: Pubkey,
    pub amount_lamports: u64,
    pub shares_minted: u128,
    pub total_shares: u128,
    pub nav_lamports: u64,
}

#[event]
pub struct WithdrawRequested {
    pub vault: Pubkey,
    pub depositor: Pubkey,
    pub shares: u128,
    pub value_at_request_lamports: u64,
}

#[event]
pub struct WithdrawExecuted {
    pub vault: Pubkey,
    pub depositor: Pubkey,
    pub instant: bool,
    pub shares_burned: u128,
    pub gross_lamports: u64,
    pub payout_lamports: u64,
    pub trader_fee_lamports: u64,
    pub platform_fee_lamports: u64,
}

/// Emitted by the permissionless stale-NAV escape hatch. Kept separate from
/// `WithdrawExecuted` so indexers can never mistake an emergency exit (priced
/// on an abandoned mark, haircut applied) for a normally priced withdrawal.
#[event]
pub struct EmergencyWithdrawExecuted {
    pub vault: Pubkey,
    pub depositor: Pubkey,
    pub shares_burned: u128,
    /// The stale mark the redemption was priced against, and its age.
    pub stale_nav_lamports: u64,
    pub nav_age_seconds: i64,
    /// Value of the shares at the stale mark, before EMERGENCY_HAIRCUT_BPS.
    pub gross_before_haircut_lamports: u64,
    /// After the haircut; this is what fees were crystallized on.
    pub gross_lamports: u64,
    pub payout_lamports: u64,
    pub trader_fee_lamports: u64,
    pub platform_fee_lamports: u64,
}

/// Emitted by the permissionless forced unwind (`settle_unwrap`).
#[event]
pub struct SettlementUnwrapped {
    pub vault: Pubkey,
    /// Lamports the closed wSOL account returned to the vault (wrapped
    /// balance + that account's rent).
    pub unwrapped_lamports: u64,
    /// How far the vault was short of its pending withdrawal reservations at
    /// the moment settlement was forced.
    pub shortfall_lamports: u64,
}

#[event]
pub struct NavPosted {
    pub vault: Pubkey,
    pub nav_lamports: u64,
    pub nav_slot: u64,
    pub locked_profit: u64,
    pub daily_loss_accumulator: u64,
    pub frozen_by_breaker: bool,
}

#[event]
pub struct SwapExecuted {
    pub vault: Pubkey,
    pub authority: Pubkey,
    pub source_mint: Pubkey,
    pub dest_mint: Pubkey,
    pub in_delta: u64,
    pub out_delta: u64,
}

#[event]
pub struct VaultStatusChanged {
    pub vault: Pubkey,
    pub status: VaultStatus,
    pub frozen_by: FrozenBy,
}
