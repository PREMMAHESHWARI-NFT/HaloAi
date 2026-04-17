#!/usr/bin/env bash
set -euo pipefail

# ─── Strategy Commitment — Testnet Deploy ─────────────────────────────────────
#
# Prerequisites:
#   1. Install Stellar CLI:  cargo install stellar-cli --locked
#   2. Add WASM target:      rustup target add wasm32-unknown-unknown
#   3. Configure identity:   stellar keys generate deployer --network testnet
#      (or use an existing identity)
#
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh
# ──────────────────────────────────────────────────────────────────────────────

NETWORK="testnet"
IDENTITY="deployer"

echo "==> Building contract (release)..."
cargo build --target wasm32-unknown-unknown --release

WASM_PATH="target/wasm32-unknown-unknown/release/strategy_commitment.wasm"

echo "==> Optimizing WASM..."
stellar contract optimize --wasm "$WASM_PATH" 2>/dev/null || echo "    (optimize skipped — install stellar-cli for smaller binary)"

# Use optimized if it exists, otherwise original
OPT_WASM="${WASM_PATH%.wasm}.optimized.wasm"
DEPLOY_WASM="${OPT_WASM}"
if [ ! -f "$OPT_WASM" ]; then
  DEPLOY_WASM="$WASM_PATH"
fi

echo "==> Deploying to $NETWORK..."
CONTRACT_ID=$(stellar contract deploy \
  --wasm "$DEPLOY_WASM" \
  --source "$IDENTITY" \
  --network "$NETWORK")

echo ""
echo "============================================"
echo " Contract deployed!"
echo " Contract ID: $CONTRACT_ID"
echo " Network:     $NETWORK"
echo "============================================"
echo ""
echo "Example invocations:"
echo ""
echo "  # Commit a strategy hash"
echo "  stellar contract invoke \\"
echo "    --id $CONTRACT_ID \\"
echo "    --source $IDENTITY \\"
echo "    --network $NETWORK \\"
echo "    -- commit \\"
echo "    --owner \$(stellar keys address $IDENTITY) \\"
echo "    --commitment <32-byte-hex>"
echo ""
echo "  # Get a commitment"
echo "  stellar contract invoke \\"
echo "    --id $CONTRACT_ID \\"
echo "    --source $IDENTITY \\"
echo "    --network $NETWORK \\"
echo "    -- get --commit_id 0"
echo ""
echo "  # Reveal"
echo "  stellar contract invoke \\"
echo "    --id $CONTRACT_ID \\"
echo "    --source $IDENTITY \\"
echo "    --network $NETWORK \\"
echo "    -- reveal \\"
echo "    --commit_id 0 \\"
echo "    --strategy <hex-bytes> \\"
echo "    --salt <hex-bytes>"
