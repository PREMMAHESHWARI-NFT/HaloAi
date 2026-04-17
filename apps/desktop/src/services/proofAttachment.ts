/**
 * Proof Attachments — ZK-ready frontend helper
 *
 * Generates SHA-256 proof hashes for the StrategyCommitment Soroban contract.
 * The proof scheme: proofHash = SHA-256(strategy || tradeParams || salt)
 *
 * ZK boundary: to swap in a real ZK system later, replace `generateProof`
 * and `verifyProof` — the rest of the codebase only depends on these two
 * functions and the ProofBundle interface.
 */

import { generateSalt, toHex, fromHex } from './strategyCommitment';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProofBundle {
    /** The 32-byte proof hash (hex) to store on-chain. */
    proofHashHex: string;
    /** The original strategy text — keep secret until reveal. */
    strategy: string;
    /** The encoded trade parameters — keep secret until reveal. */
    tradeParams: string;
    /** The random salt (hex) — keep secret until reveal. */
    saltHex: string;
}

export interface TradeParams {
    action: string;
    asset: string;
    amount: string;
    destAsset?: string;
    destAmount?: string;
}

// ─── Core (ZK boundary) ─────────────────────────────────────────────────────

/**
 * Generate a proof bundle for a strategy + trade.
 *
 * This is the ZK boundary — a real ZK prover would replace the SHA-256
 * hash with a zero-knowledge proof that reveals nothing about the inputs.
 */
export async function generateProof(
    strategy: string,
    tradeParams: string,
): Promise<ProofBundle> {
    const salt = generateSalt();
    const proofHash = await computeProofHash(strategy, tradeParams, salt);

    return {
        proofHashHex: toHex(proofHash),
        strategy,
        tradeParams,
        saltHex: toHex(salt),
    };
}

/**
 * Verify a proof locally before sending the reveal transaction.
 *
 * Returns true if sha256(strategy || tradeParams || salt) matches proofHash.
 */
export async function verifyProof(
    strategy: string,
    tradeParams: string,
    saltHex: string,
    proofHashHex: string,
): Promise<boolean> {
    const salt = fromHex(saltHex);
    const computed = await computeProofHash(strategy, tradeParams, salt);
    return toHex(computed) === proofHashHex;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Compute SHA-256(strategy_bytes || tradeParams_bytes || salt_bytes). */
async function computeProofHash(
    strategy: string,
    tradeParams: string,
    salt: Uint8Array,
): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const strategyBytes = encoder.encode(strategy);
    const paramsBytes = encoder.encode(tradeParams);

    const preimage = new Uint8Array(
        strategyBytes.length + paramsBytes.length + salt.length,
    );
    preimage.set(strategyBytes, 0);
    preimage.set(paramsBytes, strategyBytes.length);
    preimage.set(salt, strategyBytes.length + paramsBytes.length);

    const hashBuffer = await crypto.subtle.digest('SHA-256', preimage);
    return new Uint8Array(hashBuffer);
}

/** Encode structured trade parameters into a deterministic string. */
export function encodeTradeParams(params: TradeParams): string {
    const parts = [params.action, params.asset, params.amount];
    if (params.destAsset) parts.push(params.destAsset);
    if (params.destAmount) parts.push(params.destAmount);
    return parts.join(':');
}

// ─── Local Storage ───────────────────────────────────────────────────────────

const PROOF_BUNDLES_KEY = 'haloai_proof_bundles';

/** Save a proof bundle to localStorage for later reveal. */
export function saveProofBundle(proofId: number, bundle: ProofBundle): void {
    const existing = loadAllProofBundles();
    existing[proofId] = bundle;
    localStorage.setItem(PROOF_BUNDLES_KEY, JSON.stringify(existing));
}

/** Load a proof bundle from localStorage. */
export function loadProofBundle(proofId: number): ProofBundle | null {
    const all = loadAllProofBundles();
    return all[proofId] || null;
}

/** Load all saved proof bundles. */
export function loadAllProofBundles(): Record<number, ProofBundle> {
    try {
        const raw = localStorage.getItem(PROOF_BUNDLES_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}
