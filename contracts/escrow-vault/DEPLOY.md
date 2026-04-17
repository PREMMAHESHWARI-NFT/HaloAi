# Escrow Vault — Build, Deploy & Invoke

## Deployed Contract (Testnet)

| Field | Value |
|-------|-------|
| **Contract ID** | `CANZIG67XFUHEUQCRJ4ZF2BG2OPCJMWJWBQTO37MVULQFQMDTKAOACQO` |
| **Network** | Stellar Testnet |
| **WASM Hash** | `1206dac56a4b8175510ef59649d7a55e78df34dbe4d248dd1ebba1936688c799` |
| **Owner** | `GCYKOTJ2A7LO4TQH6XNET63QJMFAZ3KLPW5YJA4LMF6FZJVVIUDYDYDR` |
| **Explorer** | [Stellar Lab](https://lab.stellar.org/r/testnet/contract/CANZIG67XFUHEUQCRJ4ZF2BG2OPCJMWJWBQTO37MVULQFQMDTKAOACQO) |

### Verify Build

To verify the deployed WASM matches this source code:

```bash
cd contracts/escrow-vault
stellar contract build
sha256sum target/wasm32v1-none/release/escrow_vault.wasm
# Expected: 1206dac56a4b8175510ef59649d7a55e78df34dbe4d248dd1ebba1936688c799

# Or fetch the on-chain wasm and compare:
stellar contract fetch \
  --id CANZIG67XFUHEUQCRJ4ZF2BG2OPCJMWJWBQTO37MVULQFQMDTKAOACQO \
  --network testnet \
  --out-file fetched.wasm
sha256sum fetched.wasm
# Should match the hash above
```

---

## Prerequisites

```bash
# Install Rust + wasm target
rustup target add wasm32-unknown-unknown

# Install Stellar CLI (v21+)
cargo install --locked stellar-cli
# Or via brew: brew install stellar/tap/stellar-cli

# Configure testnet identity (one-time)
stellar keys generate deployer --network testnet
stellar keys address deployer
# Fund via https://friendbot.stellar.org?addr=<ADDRESS>
```

## Build

```bash
cd contracts/escrow-vault
stellar contract build
# Output: target/wasm32v1-none/release/escrow_vault.wasm
```

## Deploy to Testnet

```bash
stellar contract deploy \
  --wasm target/wasm32v1-none/release/escrow_vault.wasm \
  --source deployer \
  --network testnet
# Returns: CONTRACT_ID
```

Save it:
```bash
export VAULT=CANZIG67XFUHEUQCRJ4ZF2BG2OPCJMWJWBQTO37MVULQFQMDTKAOACQO
export OWNER=$(stellar keys address deployer)
```

## Initialize

```bash
stellar contract invoke \
  --id $VAULT \
  --source deployer \
  --network testnet \
  -- init \
  --owner $OWNER
```

## Deposit (e.g. 100 XLM = 100_0000000 stroops)

Use the native XLM SAC (Stellar Asset Contract) address for testnet:
```bash
# The native XLM SAC address on testnet:
export XLM_SAC=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC

stellar contract invoke \
  --id $VAULT \
  --source deployer \
  --network testnet \
  -- deposit \
  --owner $OWNER \
  --token $XLM_SAC \
  --amount 1000000000
```

## Check Balance

```bash
stellar contract invoke \
  --id $VAULT \
  --network testnet \
  -- balance \
  --owner $OWNER \
  --token $XLM_SAC
```

## Lock Funds (expires at ledger 9999999)

```bash
stellar contract invoke \
  --id $VAULT \
  --source deployer \
  --network testnet \
  -- lock \
  --owner $OWNER \
  --token $XLM_SAC \
  --amount 500000000 \
  --expires_at 9999999
# Returns: lock_id (e.g. 0)
```

## Query Lock

```bash
stellar contract invoke \
  --id $VAULT \
  --network testnet \
  -- get_lock \
  --owner $OWNER \
  --lock_id 0
```

## Release to Recipient

```bash
export RECIPIENT=GBYZ...

stellar contract invoke \
  --id $VAULT \
  --source deployer \
  --network testnet \
  -- release \
  --owner $OWNER \
  --lock_id 0 \
  --recipient $RECIPIENT
```

## Reclaim Expired Lock

```bash
stellar contract invoke \
  --id $VAULT \
  --source deployer \
  --network testnet \
  -- reclaim \
  --owner $OWNER \
  --lock_id 0
```

## Withdraw Unlocked Funds

```bash
stellar contract invoke \
  --id $VAULT \
  --source deployer \
  --network testnet \
  -- withdraw \
  --owner $OWNER \
  --token $XLM_SAC \
  --amount 500000000
```
