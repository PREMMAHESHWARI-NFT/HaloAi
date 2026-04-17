/**
 * Strategy Commitment — frontend helper
 *
 * Generates SHA-256 commitment hashes for the StrategyCommitment Soroban contract.
 * The commitment scheme: commitment = SHA-256(strategy_bytes || salt_bytes)
 *
 * Flow:
 *   1. User writes a strategy string (e.g. "buy XLM when RSI < 30")
 *   2. Frontend generates a random salt and computes commitment = sha256(strategy + salt)
 *   3. User calls contract.commit(owner, commitment) to publish the hash on-chain
 *   4. Later, user calls contract.reveal(commit_id, strategy, salt) to prove what they committed
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a cryptographically random salt (default 32 bytes). */
export function generateSalt(length = 32): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(length));
}

/** Compute SHA-256(strategy_bytes || salt_bytes) → 32-byte Uint8Array. */
export async function computeCommitment(
    strategy: string,
    salt: Uint8Array,
): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const strategyBytes = encoder.encode(strategy);

    // Concatenate strategy + salt
    const preimage = new Uint8Array(strategyBytes.length + salt.length);
    preimage.set(strategyBytes, 0);
    preimage.set(salt, strategyBytes.length);

    const hashBuffer = await crypto.subtle.digest('SHA-256', preimage);
    return new Uint8Array(hashBuffer);
}

/** Convert Uint8Array to hex string. */
export function toHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/** Convert hex string to Uint8Array. */
export function fromHex(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
}

// ─── High-level API ──────────────────────────────────────────────────────────

export interface CommitmentBundle {
    /** The 32-byte commitment hash (hex) to send on-chain. */
    commitmentHex: string;
    /** The original strategy text — keep secret until reveal. */
    strategy: string;
    /** The random salt (hex) — keep secret until reveal. */
    saltHex: string;
}

/**
 * Prepare a commitment for a strategy string.
 *
 * Returns the commitment hash (to publish on-chain) plus the secret
 * strategy + salt (to store locally until reveal).
 *
 * Usage:
 * ```ts
 * const bundle = await prepareCommitment("buy XLM when RSI < 30");
 * // Send bundle.commitmentHex to the contract's commit() method
 * // Save bundle.strategy and bundle.saltHex locally for later reveal
 * ```
 */
export async function prepareCommitment(strategy: string): Promise<CommitmentBundle> {
    const salt = generateSalt();
    const commitment = await computeCommitment(strategy, salt);

    return {
        commitmentHex: toHex(commitment),
        strategy,
        saltHex: toHex(salt),
    };
}

/**
 * Verify a commitment locally before sending the reveal transaction.
 *
 * Returns true if sha256(strategy + salt) matches the commitment.
 */
export async function verifyCommitment(
    strategy: string,
    saltHex: string,
    commitmentHex: string,
): Promise<boolean> {
    const salt = fromHex(saltHex);
    const computed = await computeCommitment(strategy, salt);
    return toHex(computed) === commitmentHex;
}
