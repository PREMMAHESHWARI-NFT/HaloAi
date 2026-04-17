/**
 * Escrow Vault — Frontend integration via @stellar/stellar-sdk
 *
 * Builds and submits Soroban contract invocation transactions.
 * The server signs (custodial), so we POST assembled XDR to our backend.
 *
 * For non-custodial usage, replace `submitViaBackend` with local Keypair signing.
 */

import * as StellarSdk from '@stellar/stellar-sdk';

const HORIZON_URL = 'https://soroban-testnet.stellar.org';  // Soroban RPC
const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;

// Set these after deploying the contract
const VAULT_CONTRACT_ID = import.meta.env.VITE_VAULT_CONTRACT_ID || '';
const XLM_SAC_ID = import.meta.env.VITE_XLM_SAC_ID || '';

const server = new StellarSdk.SorobanRpc.Server(HORIZON_URL);

// ─── Helpers ────────────────────────────────────────────────────────────────

function contractAddress(): StellarSdk.Address {
    return new StellarSdk.Address(VAULT_CONTRACT_ID);
}

function nativeI128(amount: bigint): StellarSdk.xdr.ScVal {
    return StellarSdk.nativeToScVal(amount, { type: 'i128' });
}

function nativeU64(val: number): StellarSdk.xdr.ScVal {
    return StellarSdk.nativeToScVal(val, { type: 'u64' });
}

function addressScVal(addr: string): StellarSdk.xdr.ScVal {
    return new StellarSdk.Address(addr).toScVal();
}

/**
 * Build a contract call transaction, simulate it via Soroban RPC,
 * and return the assembled (ready-to-sign) transaction.
 */
async function buildContractTx(
    sourcePublicKey: string,
    method: string,
    args: StellarSdk.xdr.ScVal[],
): Promise<StellarSdk.Transaction> {
    const sourceAccount = await server.getAccount(sourcePublicKey);

    const contract = new StellarSdk.Contract(VAULT_CONTRACT_ID);

    const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: '100',
        networkPassphrase: NETWORK_PASSPHRASE,
    })
        .addOperation(contract.call(method, ...args))
        .setTimeout(30)
        .build();

    // Simulate to get the footprint & resource fees
    const simulated = await server.simulateTransaction(tx);

    if (StellarSdk.SorobanRpc.Api.isSimulationError(simulated)) {
        throw new Error(`Simulation failed: ${simulated.error}`);
    }

    // Assemble the transaction with the simulation result
    return StellarSdk.SorobanRpc.assembleTransaction(tx, simulated).build();
}

/**
 * Sign and submit a transaction using a local Keypair (non-custodial).
 * For custodial flow, POST the XDR to your backend signing endpoint instead.
 */
async function signAndSubmit(
    tx: StellarSdk.Transaction,
    signerSecret: string,
): Promise<StellarSdk.SorobanRpc.Api.GetTransactionResponse> {
    const keypair = StellarSdk.Keypair.fromSecret(signerSecret);
    tx.sign(keypair);

    const response = await server.sendTransaction(tx);

    if (response.status === 'ERROR') {
        throw new Error(`Submit failed: ${response.errorResult?.toXDR('base64')}`);
    }

    // Poll until complete
    let result = await server.getTransaction(response.hash);
    while (result.status === 'NOT_FOUND') {
        await new Promise(r => setTimeout(r, 1000));
        result = await server.getTransaction(response.hash);
    }

    if (result.status === 'FAILED') {
        throw new Error(`Transaction failed on-chain`);
    }

    return result;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function vaultInit(
    ownerPublicKey: string,
    signerSecret: string,
): Promise<string> {
    const tx = await buildContractTx(ownerPublicKey, 'init', [
        addressScVal(ownerPublicKey),
    ]);
    const result = await signAndSubmit(tx, signerSecret);
    return result.status;
}

export async function vaultDeposit(
    ownerPublicKey: string,
    signerSecret: string,
    tokenAddress: string,
    amount: bigint,
): Promise<string> {
    const tx = await buildContractTx(ownerPublicKey, 'deposit', [
        addressScVal(ownerPublicKey),
        addressScVal(tokenAddress),
        nativeI128(amount),
    ]);
    const result = await signAndSubmit(tx, signerSecret);
    return result.status;
}

export async function vaultWithdraw(
    ownerPublicKey: string,
    signerSecret: string,
    tokenAddress: string,
    amount: bigint,
): Promise<string> {
    const tx = await buildContractTx(ownerPublicKey, 'withdraw', [
        addressScVal(ownerPublicKey),
        addressScVal(tokenAddress),
        nativeI128(amount),
    ]);
    const result = await signAndSubmit(tx, signerSecret);
    return result.status;
}

export async function vaultLock(
    ownerPublicKey: string,
    signerSecret: string,
    tokenAddress: string,
    amount: bigint,
    expiresAtLedger: number,
): Promise<{ status: string; lockId: number | null }> {
    const tx = await buildContractTx(ownerPublicKey, 'lock', [
        addressScVal(ownerPublicKey),
        addressScVal(tokenAddress),
        nativeI128(amount),
        nativeU64(expiresAtLedger),
    ]);
    const result = await signAndSubmit(tx, signerSecret);

    let lockId: number | null = null;
    if (result.status === 'SUCCESS' && result.returnValue) {
        lockId = Number(StellarSdk.scValToNative(result.returnValue));
    }
    return { status: result.status, lockId };
}

export async function vaultRelease(
    ownerPublicKey: string,
    signerSecret: string,
    lockId: number,
    recipientAddress: string,
): Promise<string> {
    const tx = await buildContractTx(ownerPublicKey, 'release', [
        addressScVal(ownerPublicKey),
        nativeU64(lockId),
        addressScVal(recipientAddress),
    ]);
    const result = await signAndSubmit(tx, signerSecret);
    return result.status;
}

export async function vaultReclaim(
    ownerPublicKey: string,
    signerSecret: string,
    lockId: number,
): Promise<string> {
    const tx = await buildContractTx(ownerPublicKey, 'reclaim', [
        addressScVal(ownerPublicKey),
        nativeU64(lockId),
    ]);
    const result = await signAndSubmit(tx, signerSecret);
    return result.status;
}

// ─── Read-only queries (no signing needed) ──────────────────────────────────

export async function vaultBalance(
    ownerPublicKey: string,
    tokenAddress: string,
): Promise<bigint> {
    const contract = new StellarSdk.Contract(VAULT_CONTRACT_ID);

    const tx = new StellarSdk.TransactionBuilder(
        await server.getAccount(ownerPublicKey),
        { fee: '100', networkPassphrase: NETWORK_PASSPHRASE },
    )
        .addOperation(contract.call('balance', addressScVal(ownerPublicKey), addressScVal(tokenAddress)))
        .setTimeout(30)
        .build();

    const simulated = await server.simulateTransaction(tx);

    if (StellarSdk.SorobanRpc.Api.isSimulationError(simulated)) {
        throw new Error(`Query failed: ${simulated.error}`);
    }

    if (StellarSdk.SorobanRpc.Api.isSimulationSuccess(simulated) && simulated.result) {
        return BigInt(StellarSdk.scValToNative(simulated.result.retval));
    }
    return 0n;
}

export interface LockEntry {
    token: string;
    amount: bigint;
    expiresAt: number;
    status: 'Active' | 'Released' | 'Expired';
}

export async function vaultGetLock(
    ownerPublicKey: string,
    lockId: number,
): Promise<LockEntry> {
    const contract = new StellarSdk.Contract(VAULT_CONTRACT_ID);

    const tx = new StellarSdk.TransactionBuilder(
        await server.getAccount(ownerPublicKey),
        { fee: '100', networkPassphrase: NETWORK_PASSPHRASE },
    )
        .addOperation(contract.call('get_lock', addressScVal(ownerPublicKey), nativeU64(lockId)))
        .setTimeout(30)
        .build();

    const simulated = await server.simulateTransaction(tx);

    if (StellarSdk.SorobanRpc.Api.isSimulationError(simulated)) {
        throw new Error(`Query failed: ${simulated.error}`);
    }

    if (StellarSdk.SorobanRpc.Api.isSimulationSuccess(simulated) && simulated.result) {
        const raw = StellarSdk.scValToNative(simulated.result.retval);
        return {
            token: raw.token,
            amount: BigInt(raw.amount),
            expiresAt: Number(raw.expires_at),
            status: raw.status,
        };
    }
    throw new Error('Lock not found');
}
