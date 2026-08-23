# Deployment record

The authoritative record of what is deployed where. Kept here rather than in
source comments because a comment cannot be checked, and the ones that were
in `lib.rs` and `docs/GO-LIVE.md` named the **wrong cluster and the wrong
key** — devnet and `7UxfASUx…` for a program that has only ever held real SOL
on mainnet under `4MERY…`. An operator or CI job trusting that record during
an upgrade targets the wrong chain with the wrong authority.

## vault program

| | |
|---|---|
| Program id | `8315nL9tGA3TdYC6jr2jRiB1ccDepRKdXpBVmNybtW2U` |
| Cluster | **mainnet-beta** |
| Loader | BPFLoaderUpgradeable |
| ProgramData | `4f2ou6xRPTnaxhSXjyQiN3g265WrEJWhLCFmiLotai96` |
| Upgrade authority | `4MERYBFWdz37zr13AyrntYtZDxdbZhdzvAxFuXiTLSpd` |
| Platform admin | `4MERYBFWdz37zr13AyrntYtZDxdbZhdzvAxFuXiTLSpd` (rotatable) |
| NAV keeper | `AWaqgYCF5dXHfjeF7MDhaqPcZcpTZ3jE8DrXY3gK35f2` |
| PlatformConfig | `7regQMPf2nQjiDJMYxKsA61biaogx4N6wDTueCnhe5Dz` (seed `platform_config_v2`) |
| Treasury | `9ubE7BDXTDoyyg9zFaRN5YmYfp6ZMMDQUZJix9JvqKts` (seed `treasury_v2`) |

### Deploys

Every row records the sha256 of the `.so` that was built, so
`solana program dump` can be diffed against it. A deploy without a recorded
hash is a deploy nobody can verify.

| Date | Signature | sha256(vault.so) | Notes |
|---|---|---|---|
| 2026-08-23 | `5s8XFR34oAHkS2ttpdN5LVxKsjmCqCeprff3S6qPC3yNLmsAjGzYFE58q5AKft9dbb1HQE2DP2feJfeFXgmTkeFB` | `f74a2b515956155e6abcfd3c63563fcc53cd2428e4f075d9a199709702cfd08d` | Security review fixes; `treasury_v2` seed |
| 2026-08-23 | `2Gojv6e7WmSrhTS5k6oybzKVnzJxgNYA7Brf7QTkxGedM6ncP52GgACxmU9UJRazmad3r17Jp3x5Uoa6dCnfBNhn` | `dd399da767be0b4053019176ad7e9fd16d491aaf19cccab1074b5fad223004d0` | Superseded 40 minutes later |
| 2026-08-23 | `2mSzSb9oQ4f61yCMrdbR3XhcNyj251R5MCmGJYW2Sftr4tJWW6cEJngXwwuCXgsQ3hCueUymnBaDW4YowbLmq54k` | — | `init_platform` (v2 config + treasury) |

Verify the running bytecode against a row:

```bash
solana program dump 8315nL9tGA3TdYC6jr2jRiB1ccDepRKdXpBVmNybtW2U /tmp/onchain.so -u <rpc>
head -c $(stat -c%s target/deploy/vault.so) /tmp/onchain.so | sha256sum
```

The dump is padded out to the ProgramData length, which is why it is trimmed
to the local `.so` size before hashing.

## Account sizes

`getProgramAccounts` filters match on `dataSize`, so a layout change orphans
every indexer that hardcodes one. The program's own `print_account_sizes`
test prints these; update them together.

| Account | Bytes | Was |
|---|---|---|
| `Vault` | 1095 | 647 |
| `VaultDepositor` | 169 | 161 |
| `PlatformConfig` | 235 | 43 |

## Abandoned by the seed change

Vault PDAs are now seeded `["vault", creator, name]` rather than on the name
alone, so the six vaults created under the old seeds are unreachable by this
build. They held 0.092364 SOL total and **had no depositors** — every lamport
was the platform's own `MIN_SEED_LAMPORTS`, which is economically burned by
design and was never redeemable under either build. The v1 `platform_config`
and `treasury` keep their rent and are inert.

## Known, and not a code defect

The upgrade authority is a single key, and it is the same key that receives
pump.fun creator fees. `propose_admin` / `accept_admin` now exist so the
platform admin role can be moved to a multisig without breaking NAV posting —
that was impossible in the previous build, because every vault's NAV keeper
was pinned to the admin and had to sign hourly. Moving the upgrade authority
to a Squads multisig is the remaining step and it is a decision with real
consequences: a lost multisig is a permanently unupgradeable program.
