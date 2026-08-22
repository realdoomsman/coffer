# Coffer X Account — Content Queue

## Ready to Post (Manual)

### Post 1: Launch (Immediate)
```
TRADER VAULTS ON SOLANA

Back the best traders. They can never run.

Traders pool your capital, trade it, and take 30% of profits.
But they can never withdraw from the vault.

Custody lives in a program-owned PDA. No code path moves funds to non-vault accounts.

70% to depositors. 30% to traders. On-chain record.

coffer.fun
```

### Post 2: Terminal Features (2pm today)
```
NEW: Live terminal trading

Real SOL, real execution, via Jupiter Router.

1-second charts from Birdeye. Position-based limit orders. Gas receipts.

devnet now → mainnet after audit.

See it in action: [screenshot coming]

coffer.fun/terminal
```

### Post 3: 70/30 Economics Explained (7pm today)
```
Why 70/30?

Most platforms take 20-50% off the top.

We take 0%.

70% of vault profits go to depositors. 30% goes to the trader.

The trader's 30% is vested over 60 days — so if they blow up, they can't walk with it.

No platform cut. No hidden fees.

Just capital allocation that works.
```

## Weekly Threads

### Thread 1: How Vault Custody Works
```
1/7
How trader vault custody actually works.

Most copy trading gives traders control over funds. This is the problem.

On Coffer, traders cannot withdraw. Ever.

Here's the architecture:

2/7
When you deposit into a vault, your funds go to a program-owned PDA.

The trader's authority allows them to:
- Execute trades via Jupiter
- Withdraw their 30% share of profits

They CANNOT:
- Withdraw principal
- Move funds to their wallet
- Transfer to non-vault addresses

3/7
This is enforced at the program level, not by a contract.

The PDA is derived from the vault seed.
The trader is a signer on the vault account.
Only the program can move funds out.

4/7
What about profit distribution?

When the trader realizes a gain:
- 70% stays in the vault (depositor equity)
- 30% is transferred to the trader (vested)

Both transfers happen in the same transaction.

5/7
The 60-day vesting prevents rug pulls.

If the trader makes $10,000 on day 1:
- $3,000 is allocated to them
- They can only withdraw ~$50/day for 60 days

If they blow up the vault in week 2, the unvested portion stays with depositors.

6/7
Compare this to standard copy trading:

Standard:
- Traders have full custody of your funds
- They can exit with your capital anytime
- No mechanism to prevent exit scams

Coffer:
- Traders never have custody
- Funds are locked in program-owned PDA
- Vesting prevents premature profit extraction

7/7
This is the core value proposition:

Back the best traders. They can never run.

coffer.fun
```

### Thread 2: Vaults vs Copy Trading
```
1/5
Vaults vs copy trading. What's the difference?

They sound similar, but the mechanics are completely different.

Let's compare:

2/5
Copy Trading:

You connect your wallet to a trader.
They execute trades from your wallet.
You pay a performance fee (often 20-50%).

Problem: The trader has full custody of your funds. They can drain your wallet at any time.

3/5
Trader Vaults:

You deposit into a vault.
The trader executes trades from the vault.
They take 30% of profits.

Key difference: The trader NEVER has custody. Funds are in a program-owned PDA. They cannot withdraw.

4/5
Why this matters:

In copy trading, if a trader exits, your funds go with them. There's no protection.

In vaults, if a trader exits, the vault continues. The vault owner can assign a new trader. Depositors are never at risk.

5/5
The safety layer is architectural, not contractual.

We don't rely on reputation. We rely on program constraints.

coffer.fun
```

## Evergreen Content

### Post: On-Chain Verification
```
Everything is verifiable on-chain.

Each vault is a separate Solana account.
Every trade leaves a transaction signature.
Profit distributions are public records.

You don't have to trust us. You can verify.

Check any vault: coffer.fun/vault/[address]
```

### Post: Why Solana?
```
Why Solana for trader vaults?

1. Speed: Real-time trading requires sub-second finality
2. Cost: High-frequency trading needs low fees
3. Jupiter: The best DEX aggregator lives here
4. Account model: PDAs make custody constraints possible

Try building this on ETH mainnet. The gas alone would wipe out returns.
```

### Post: For Traders
```
For traders: Why start a vault?

1. Leverage other people's capital
2. Take 30% of profits with no upfront cost
3. Build a track record on-chain
4. No custody risk = better trust from depositors

You trade with more capital than you own. You keep 30% of what you make.

Simple.

coffer.fun/create-vault
```

## Posting Schedule

- Morning (9am ET): Educational content
- Afternoon (2pm ET): Features/announcements  
- Evening (7pm ET): Mechanics/explanations

- Threads: 1-2 per week (usually Monday/Thursday)
- Engagement: Reply to mentions within 1-2 hours
- Follow strategy: Follow relevant accounts (Solana, DeFi, trading)

## Brand Voice

- No emojis
- No hype language
- Technical but accessible
- Focus on mechanics, not benefits
- Direct, concise sentences
- Factual claims with on-chain verification

## Hashtags (Minimal)

Use sparingly:
- #Solana
- #DeFi
- #TraderVaults

Never:
- #ToTheMoon
- #Crypto
- #Altcoin
- #100x
