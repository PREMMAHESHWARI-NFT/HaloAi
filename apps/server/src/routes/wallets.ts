import { Router, Request, Response } from 'express';
import * as StellarSdk from '@stellar/stellar-sdk';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const router = Router();

// --- Encryption helpers ---
const ALGO = 'aes-256-gcm';
const ENCRYPTION_KEY = process.env.WALLET_ENCRYPTION_KEY || 'default-dev-key-change-in-production!!';

function deriveKey(secret: string): Buffer {
    return crypto.scryptSync(secret, 'haloai-salt', 32);
}

function encrypt(text: string): string {
    const key = deriveKey(ENCRYPTION_KEY);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGO, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decrypt(data: string): string {
    const key = deriveKey(ENCRYPTION_KEY);
    const [ivHex, authTagHex, encryptedHex] = data.split(':');
    const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// --- Supabase setup ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('[Wallets] SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log(`[Wallets] Connected to Supabase at ${supabaseUrl}`);

// --- Stellar ---
const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const horizon = new StellarSdk.Horizon.Server(HORIZON_URL);

// USDC on testnet
const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const USDC_ASSET = new StellarSdk.Asset('USDC', USDC_ISSUER);

// --- Soroban / Escrow Vault ---
const SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';
const sorobanServer = new StellarSdk.rpc.Server(SOROBAN_RPC_URL);
const VAULT_CONTRACT_ID = 'CANZIG67XFUHEUQCRJ4ZF2BG2OPCJMWJWBQTO37MVULQFQMDTKAOACQO';
const XLM_SAC_ID = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const STRATEGY_CONTRACT_ID = 'CBNYO7UL3A3254A752CNMFIFJRXH6HLIAGPM6YLSFHU27LAU4JTBY4WO';

// POST /api/wallets — create or return existing wallet
router.post('/', async (req: Request, res: Response) => {
    try {
        const { privyUserId } = req.body;
        if (!privyUserId) {
            return res.status(400).json({ error: 'privyUserId is required' });
        }

        // Return existing wallet if already created
        const { data: existing } = await supabase
            .from('wallets')
            .select('*')
            .eq('privy_user_id', privyUserId)
            .limit(1)
            .maybeSingle();

        if (existing) {
            const balance = await getBalance(existing.public_key);
            return res.json({ address: existing.public_key, balance });
        }

        // Generate new Stellar keypair
        const pair = StellarSdk.Keypair.random();
        const encryptedSecret = encrypt(pair.secret());

        const { error: insertError } = await supabase
            .from('wallets')
            .insert({
                privy_user_id: privyUserId,
                public_key: pair.publicKey(),
                encrypted_secret: encryptedSecret,
            });

        if (insertError) {
            throw insertError;
        }

        console.log(`[Wallets] Created wallet for ${privyUserId}: ${pair.publicKey()}`);

        // Fund on testnet via friendbot
        try {
            await fetch(`https://friendbot.stellar.org?addr=${pair.publicKey()}`);
        } catch {
            // Friendbot may fail, wallet still created
        }

        const balance = await getBalance(pair.publicKey());
        return res.json({ address: pair.publicKey(), balance });
    } catch (err: any) {
        console.error('[Wallets] Create error:', err.message);
        return res.status(500).json({ error: 'Failed to create wallet' });
    }
});

// GET /api/wallets/:userId — get wallet info
router.get('/:userId', async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        const { data: wallet } = await supabase
            .from('wallets')
            .select('*')
            .eq('privy_user_id', userId)
            .limit(1)
            .maybeSingle();

        if (!wallet) {
            return res.status(404).json({ error: 'Wallet not found' });
        }

        const balance = await getBalance(wallet.public_key);
        return res.json({ address: wallet.public_key, balance });
    } catch (err: any) {
        console.error('[Wallets] Get error:', err.message);
        return res.status(500).json({ error: 'Failed to fetch wallet' });
    }
});

// POST /api/wallets/:userId/send — send XLM
router.post('/:userId/send', async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        const { to, amount } = req.body;

        if (!to || !amount) {
            return res.status(400).json({ error: 'to and amount are required' });
        }

        const { data: wallet } = await supabase
            .from('wallets')
            .select('*')
            .eq('privy_user_id', userId)
            .limit(1)
            .maybeSingle();

        if (!wallet) {
            return res.status(404).json({ error: 'Wallet not found' });
        }

        const secretKey = decrypt(wallet.encrypted_secret);
        const sourceKeypair = StellarSdk.Keypair.fromSecret(secretKey);
        const account = await horizon.loadAccount(wallet.public_key);

        const tx = new StellarSdk.TransactionBuilder(account, {
            fee: StellarSdk.BASE_FEE,
            networkPassphrase: StellarSdk.Networks.TESTNET,
        })
            .addOperation(
                StellarSdk.Operation.payment({
                    destination: to,
                    asset: StellarSdk.Asset.native(),
                    amount: String(amount),
                })
            )
            .setTimeout(30)
            .build();

        tx.sign(sourceKeypair);
        const result = await horizon.submitTransaction(tx);

        const balance = await getBalance(wallet.public_key);
        return res.json({ txHash: result.hash, balance });
    } catch (err: any) {
        console.error('[Wallets] Send error:', err.message);
        return res.status(500).json({ error: 'Failed to send XLM' });
    }
});

// GET /api/wallets/:userId/transactions — get transaction history
router.get('/:userId/transactions', async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        const { data: wallet } = await supabase
            .from('wallets')
            .select('*')
            .eq('privy_user_id', userId)
            .limit(1)
            .maybeSingle();

        if (!wallet) {
            return res.status(404).json({ error: 'Wallet not found' });
        }

        const payments = await horizon
            .payments()
            .forAccount(wallet.public_key)
            .order('desc')
            .limit(20)
            .call();

        const validTypes = ['payment', 'create_account', 'path_payment_strict_send', 'path_payment_strict_receive'];
        const transactions = payments.records
            .filter((r: any) => validTypes.includes(r.type))
            .map((r: any) => {
                if (r.type === 'create_account') {
                    return {
                        id: r.id,
                        type: 'received',
                        amount: r.starting_balance,
                        asset: 'XLM',
                        from: r.source_account,
                        to: r.account,
                        date: r.created_at,
                        txHash: r.transaction_hash,
                    };
                }
                if (r.type === 'path_payment_strict_send' || r.type === 'path_payment_strict_receive') {
                    return {
                        id: r.id,
                        type: 'trade',
                        amount: r.amount,
                        asset: r.asset_type === 'native' ? 'XLM' : r.asset_code,
                        sourceAsset: r.source_asset_type === 'native' ? 'XLM' : r.source_asset_code,
                        sourceAmount: r.source_amount,
                        from: r.from,
                        to: r.to,
                        date: r.created_at,
                        txHash: r.transaction_hash,
                    };
                }
                const isSent = r.from === wallet.public_key;
                return {
                    id: r.id,
                    type: isSent ? 'sent' : 'received',
                    amount: r.amount,
                    asset: r.asset_type === 'native' ? 'XLM' : r.asset_code,
                    from: r.from,
                    to: r.to,
                    date: r.created_at,
                    txHash: r.transaction_hash,
                };
            });

        return res.json({ transactions });
    } catch (err: any) {
        console.error('[Wallets] Transactions error:', err.message);
        return res.json({ transactions: [] });
    }
});

// GET /api/wallets/:userId/trustlines — check USDC trustline
router.get('/:userId/trustlines', async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        const { data: wallet } = await supabase
            .from('wallets')
            .select('*')
            .eq('privy_user_id', userId)
            .limit(1)
            .maybeSingle();

        if (!wallet) {
            return res.status(404).json({ error: 'Wallet not found' });
        }

        const account = await horizon.loadAccount(wallet.public_key);
        const hasTrustline = account.balances.some(
            (b: any) => b.asset_type === 'credit_alphanum4' && b.asset_code === 'USDC' && b.asset_issuer === USDC_ISSUER
        );
        return res.json({ hasTrustline, balances: account.balances });
    } catch (err: any) {
        console.error('[Wallets] Trustline check error:', err.message);
        return res.status(500).json({ error: 'Failed to check trustlines' });
    }
});

// POST /api/wallets/:userId/trustline — add USDC trustline
router.post('/:userId/trustline', async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        const { data: wallet } = await supabase
            .from('wallets')
            .select('*')
            .eq('privy_user_id', userId)
            .limit(1)
            .maybeSingle();

        if (!wallet) {
            return res.status(404).json({ error: 'Wallet not found' });
        }

        const secretKey = decrypt(wallet.encrypted_secret);
        const sourceKeypair = StellarSdk.Keypair.fromSecret(secretKey);
        const account = await horizon.loadAccount(wallet.public_key);

        const tx = new StellarSdk.TransactionBuilder(account, {
            fee: StellarSdk.BASE_FEE,
            networkPassphrase: StellarSdk.Networks.TESTNET,
        })
            .addOperation(StellarSdk.Operation.changeTrust({ asset: USDC_ASSET }))
            .setTimeout(30)
            .build();

        tx.sign(sourceKeypair);
        const result = await horizon.submitTransaction(tx);

        return res.json({ txHash: result.hash, success: true });
    } catch (err: any) {
        console.error('[Wallets] Trustline add error:', err.message);
        return res.status(500).json({ error: 'Failed to add USDC trustline' });
    }
});

// GET /api/wallets/:userId/swap-quote — get XLM→USDC quote
router.get('/:userId/swap-quote', async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        const { amount } = req.query;

        if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
            return res.status(400).json({ error: 'Valid amount is required' });
        }

        const { data: wallet } = await supabase
            .from('wallets')
            .select('*')
            .eq('privy_user_id', userId)
            .limit(1)
            .maybeSingle();

        if (!wallet) {
            return res.status(404).json({ error: 'Wallet not found' });
        }

        const paths = await horizon
            .strictSendPaths(StellarSdk.Asset.native(), String(amount), [USDC_ASSET])
            .call();

        if (!paths.records || paths.records.length === 0) {
            return res.status(404).json({ error: 'No swap path found for this amount' });
        }

        // Pick the best (highest destination_amount)
        const best = paths.records.reduce((a: any, b: any) =>
            parseFloat(a.destination_amount) >= parseFloat(b.destination_amount) ? a : b
        );

        return res.json({
            destinationAmount: best.destination_amount,
            path: best.path,
            sourceAmount: best.source_amount,
        });
    } catch (err: any) {
        console.error('[Wallets] Swap quote error:', err.message);
        return res.status(500).json({ error: 'Failed to fetch swap quote' });
    }
});

// POST /api/wallets/:userId/swap — execute XLM→USDC swap
router.post('/:userId/swap', async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        const { amount, minDestAmount } = req.body;

        if (!amount || !minDestAmount) {
            return res.status(400).json({ error: 'amount and minDestAmount are required' });
        }

        const { data: wallet } = await supabase
            .from('wallets')
            .select('*')
            .eq('privy_user_id', userId)
            .limit(1)
            .maybeSingle();

        if (!wallet) {
            return res.status(404).json({ error: 'Wallet not found' });
        }

        const secretKey = decrypt(wallet.encrypted_secret);
        const sourceKeypair = StellarSdk.Keypair.fromSecret(secretKey);
        const account = await horizon.loadAccount(wallet.public_key);

        const tx = new StellarSdk.TransactionBuilder(account, {
            fee: StellarSdk.BASE_FEE,
            networkPassphrase: StellarSdk.Networks.TESTNET,
        })
            .addOperation(
                StellarSdk.Operation.pathPaymentStrictSend({
                    sendAsset: StellarSdk.Asset.native(),
                    sendAmount: String(amount),
                    destination: wallet.public_key, // swap to self
                    destAsset: USDC_ASSET,
                    destMin: String(minDestAmount),
                    path: [], // let network find best route
                })
            )
            .setTimeout(30)
            .build();

        tx.sign(sourceKeypair);
        const result = await horizon.submitTransaction(tx);

        const balance = await getBalance(wallet.public_key);
        return res.json({ txHash: result.hash, balance });
    } catch (err: any) {
        console.error('[Wallets] Swap error:', err.message);
        const msg = err?.response?.data?.extras?.result_codes
            ? JSON.stringify(err.response.data.extras.result_codes)
            : 'Failed to execute swap';
        return res.status(500).json({ error: msg });
    }
});

// ─── Soroban helpers ─────────────────────────────────────────────────────────

function addressScVal(addr: string): StellarSdk.xdr.ScVal {
    return new StellarSdk.Address(addr).toScVal();
}

function nativeI128(amount: bigint): StellarSdk.xdr.ScVal {
    return StellarSdk.nativeToScVal(amount, { type: 'i128' });
}

function nativeU64(val: number): StellarSdk.xdr.ScVal {
    return StellarSdk.nativeToScVal(val, { type: 'u64' });
}

async function buildAndSubmitSoroban(
    publicKey: string,
    secretKey: string,
    contractId: string,
    method: string,
    args: StellarSdk.xdr.ScVal[],
): Promise<StellarSdk.rpc.Api.GetTransactionResponse> {
    const sourceAccount = await sorobanServer.getAccount(publicKey);
    const contract = new StellarSdk.Contract(contractId);

    const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: '300000',
        networkPassphrase: StellarSdk.Networks.TESTNET,
    })
        .addOperation(contract.call(method, ...args))
        .setTimeout(60)
        .build();

    const simulated = await sorobanServer.simulateTransaction(tx);

    // Log simulation result for debugging
    console.log(`[Soroban] Simulate ${method}: error=${StellarSdk.rpc.Api.isSimulationError(simulated)}, restore=${StellarSdk.rpc.Api.isSimulationRestore(simulated)}, success=${StellarSdk.rpc.Api.isSimulationSuccess(simulated)}`);

    if (StellarSdk.rpc.Api.isSimulationError(simulated)) {
        const errDetail = (simulated as any).error || JSON.stringify(simulated.events || []);
        console.error('[Soroban] Simulation error for', method, ':', errDetail);
        // Try to extract contract error code from events
        const errMsg = errDetail.includes('Error(Contract')
            ? `Contract error: ${errDetail}`
            : `Simulation failed: ${errDetail}`;
        throw new Error(errMsg);
    }

    // Handle restore case (expired contract state needs TTL extension)
    if (StellarSdk.rpc.Api.isSimulationRestore(simulated)) {
        console.log('[Soroban] Restoring expired contract state...');
        const restoreTx = StellarSdk.rpc.assembleTransaction(tx, simulated).build();
        const keypair = StellarSdk.Keypair.fromSecret(secretKey);
        restoreTx.sign(keypair);
        const restoreRes = await sorobanServer.sendTransaction(restoreTx);
        if (restoreRes.status === 'ERROR') {
            throw new Error(`Restore failed: ${restoreRes.errorResult?.toXDR('base64')}`);
        }
        let restoreResult = await sorobanServer.getTransaction(restoreRes.hash);
        while (restoreResult.status === 'NOT_FOUND') {
            await new Promise(r => setTimeout(r, 1000));
            restoreResult = await sorobanServer.getTransaction(restoreRes.hash);
        }
        if (restoreResult.status === 'FAILED') {
            throw new Error('Restore transaction failed');
        }
        // Retry the original call after restore
        return buildAndSubmitSoroban(publicKey, secretKey, contractId, method, args);
    }

    // Check for contract errors in simulation events before assembling
    // (simulation can "succeed" but the contract returned an Err() that crashes assembleTransaction)
    const simEvents = (simulated as any).events || [];
    for (const evt of simEvents) {
        if (typeof evt === 'string' && evt.includes('Error(Contract')) {
            const errorMap: Record<string, string> = {
                '1': 'AlreadyInitialized', '2': 'NotInitialized', '3': 'NotOwner',
                '4': 'InsufficientFunds', '5': 'InvalidAmount', '6': 'LockNotFound',
                '7': 'LockNotActive', '8': 'LockExpired', '9': 'LockNotExpired', '10': 'InvalidExpiry',
            };
            const codeMatch = evt.match(/#(\d+)/);
            const code = codeMatch?.[1] || 'unknown';
            const errName = errorMap[code] || `error code ${code}`;
            throw new Error(`Vault error: ${errName}`);
        }
    }

    let assembled;
    try {
        assembled = StellarSdk.rpc.assembleTransaction(tx, simulated).build();
    } catch (assembleErr: any) {
        // "Bad union switch: N" means the contract returned an error during simulation
        if (assembleErr.message?.includes('union switch')) {
            const switchVal = assembleErr.message.match(/switch: (\d+)/)?.[1];
            const errorMap: Record<string, string> = {
                '1': 'AlreadyInitialized', '2': 'NotInitialized', '3': 'NotOwner',
                '4': 'InsufficientFunds', '5': 'InvalidAmount', '6': 'LockNotFound',
                '7': 'LockNotActive', '8': 'LockExpired', '9': 'LockNotExpired', '10': 'InvalidExpiry',
            };
            const errName = switchVal && errorMap[switchVal] ? errorMap[switchVal] : `error code ${switchVal}`;
            throw new Error(`Vault error: ${errName}`);
        }
        throw assembleErr;
    }
    const keypair = StellarSdk.Keypair.fromSecret(secretKey);
    assembled.sign(keypair);

    const response = await sorobanServer.sendTransaction(assembled);
    if (response.status === 'ERROR') {
        throw new Error(`Submit failed: ${response.errorResult?.toXDR('base64')}`);
    }

    let result = await sorobanServer.getTransaction(response.hash);
    while (result.status === 'NOT_FOUND') {
        await new Promise(r => setTimeout(r, 1000));
        result = await sorobanServer.getTransaction(response.hash);
    }
    if (result.status === 'FAILED') {
        throw new Error('Transaction failed on-chain');
    }
    return result;
}

async function simulateReadOnly(
    publicKey: string,
    contractId: string,
    method: string,
    args: StellarSdk.xdr.ScVal[],
): Promise<StellarSdk.xdr.ScVal | null> {
    const sourceAccount = await sorobanServer.getAccount(publicKey);
    const contract = new StellarSdk.Contract(contractId);

    const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: '100',
        networkPassphrase: StellarSdk.Networks.TESTNET,
    })
        .addOperation(contract.call(method, ...args))
        .setTimeout(30)
        .build();

    const simulated = await sorobanServer.simulateTransaction(tx);
    if (StellarSdk.rpc.Api.isSimulationError(simulated)) {
        throw new Error(`Query failed: ${simulated.error}`);
    }
    if (StellarSdk.rpc.Api.isSimulationSuccess(simulated) && simulated.result) {
        return simulated.result.retval;
    }
    return null;
}

async function getWalletRecord(userId: string) {
    const { data: wallet } = await supabase
        .from('wallets')
        .select('*')
        .eq('privy_user_id', userId)
        .limit(1)
        .maybeSingle();
    return wallet;
}

// ─── Vault endpoints ─────────────────────────────────────────────────────────

// GET /api/wallets/:userId/vault/balance
router.get('/:userId/vault/balance', async (req: Request, res: Response) => {
    try {
        const wallet = await getWalletRecord(req.params.userId);
        if (!wallet) return res.status(404).json({ error: 'Wallet not found' });

        const retval = await simulateReadOnly(wallet.public_key, VAULT_CONTRACT_ID, 'balance', [
            addressScVal(wallet.public_key),
            addressScVal(XLM_SAC_ID),
        ]);
        const stroops = retval ? BigInt(StellarSdk.scValToNative(retval)) : 0n;
        // Convert stroops to XLM (7 decimal places)
        const xlm = Number(stroops) / 1e7;
        return res.json({ balance: xlm.toFixed(7) });
    } catch (err: any) {
        console.error('[Vault] Balance error:', err.message);
        return res.status(500).json({ error: 'Failed to fetch vault balance' });
    }
});

// POST /api/wallets/:userId/vault/deposit
router.post('/:userId/vault/deposit', async (req: Request, res: Response) => {
    try {
        const { amount } = req.body;
        if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
            return res.status(400).json({ error: 'Valid amount (in XLM) is required' });
        }
        const wallet = await getWalletRecord(req.params.userId);
        if (!wallet) return res.status(404).json({ error: 'Wallet not found' });

        const secretKey = decrypt(wallet.encrypted_secret);
        const stroops = BigInt(Math.round(Number(amount) * 1e7));

        const sorobanResult = await buildAndSubmitSoroban(wallet.public_key, secretKey, VAULT_CONTRACT_ID, 'deposit', [
            addressScVal(wallet.public_key),
            addressScVal(XLM_SAC_ID),
            nativeI128(stroops),
        ]);

        const balance = await getBalance(wallet.public_key);
        return res.json({ txHash: (sorobanResult as any).hash || 'ok', balance });
    } catch (err: any) {
        console.error('[Vault] Deposit error:', err.message);
        return res.status(500).json({ error: err.message || 'Failed to deposit into vault' });
    }
});

// POST /api/wallets/:userId/vault/withdraw
router.post('/:userId/vault/withdraw', async (req: Request, res: Response) => {
    try {
        const { amount } = req.body;
        if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
            return res.status(400).json({ error: 'Valid amount (in XLM) is required' });
        }
        const wallet = await getWalletRecord(req.params.userId);
        if (!wallet) return res.status(404).json({ error: 'Wallet not found' });

        const secretKey = decrypt(wallet.encrypted_secret);
        const stroops = BigInt(Math.round(Number(amount) * 1e7));

        const sorobanResult = await buildAndSubmitSoroban(wallet.public_key, secretKey, VAULT_CONTRACT_ID, 'withdraw', [
            addressScVal(wallet.public_key),
            addressScVal(XLM_SAC_ID),
            nativeI128(stroops),
        ]);

        const balance = await getBalance(wallet.public_key);
        return res.json({ txHash: (sorobanResult as any).hash || 'ok', balance });
    } catch (err: any) {
        console.error('[Vault] Withdraw error:', err.message);
        return res.status(500).json({ error: err.message || 'Failed to withdraw from vault' });
    }
});

// POST /api/wallets/:userId/vault/lock
router.post('/:userId/vault/lock', async (req: Request, res: Response) => {
    try {
        const { amount, lockMinutes } = req.body;
        if (!amount || !lockMinutes) {
            return res.status(400).json({ error: 'amount and lockMinutes are required' });
        }
        const wallet = await getWalletRecord(req.params.userId);
        if (!wallet) return res.status(404).json({ error: 'Wallet not found' });

        // Fetch current ledger and compute absolute expiry
        // Stellar ledgers close roughly every ~5 seconds
        const latestLedger = await sorobanServer.getLatestLedger();
        const currentLedger = latestLedger.sequence;
        const ledgersPerMinute = 12; // ~5s per ledger
        const expiresAt = currentLedger + Math.ceil(Number(lockMinutes) * ledgersPerMinute);

        const secretKey = decrypt(wallet.encrypted_secret);
        const stroops = BigInt(Math.round(Number(amount) * 1e7));

        const result = await buildAndSubmitSoroban(wallet.public_key, secretKey, VAULT_CONTRACT_ID, 'lock', [
            addressScVal(wallet.public_key),
            addressScVal(XLM_SAC_ID),
            nativeI128(stroops),
            nativeU64(expiresAt),
        ]);

        let lockId: number | null = null;
        if (result.status === 'SUCCESS' && result.returnValue) {
            lockId = Number(StellarSdk.scValToNative(result.returnValue));
        }
        return res.json({ txHash: (result as any).hash || 'ok', lockId });
    } catch (err: any) {
        console.error('[Vault] Lock error:', err.message);
        return res.status(500).json({ error: err.message || 'Failed to lock funds' });
    }
});

// GET /api/wallets/:userId/vault/lock/:lockId
router.get('/:userId/vault/lock/:lockId', async (req: Request, res: Response) => {
    try {
        const wallet = await getWalletRecord(req.params.userId);
        if (!wallet) return res.status(404).json({ error: 'Wallet not found' });

        const retval = await simulateReadOnly(wallet.public_key, VAULT_CONTRACT_ID, 'get_lock', [
            addressScVal(wallet.public_key),
            nativeU64(Number(req.params.lockId)),
        ]);
        if (!retval) return res.status(404).json({ error: 'Lock not found' });

        const raw = StellarSdk.scValToNative(retval);
        return res.json({
            token: raw.token,
            amount: (Number(BigInt(raw.amount)) / 1e7).toFixed(7),
            expiresAt: Number(raw.expires_at),
            status: raw.status,
        });
    } catch (err: any) {
        console.error('[Vault] Get lock error:', err.message);
        return res.status(500).json({ error: 'Failed to fetch lock' });
    }
});

// POST /api/wallets/:userId/vault/release
router.post('/:userId/vault/release', async (req: Request, res: Response) => {
    try {
        const { lockId, recipient } = req.body;
        if (lockId === undefined || !recipient) {
            return res.status(400).json({ error: 'lockId and recipient are required' });
        }
        const wallet = await getWalletRecord(req.params.userId);
        if (!wallet) return res.status(404).json({ error: 'Wallet not found' });

        const secretKey = decrypt(wallet.encrypted_secret);
        const sorobanResult = await buildAndSubmitSoroban(wallet.public_key, secretKey, VAULT_CONTRACT_ID, 'release', [
            addressScVal(wallet.public_key),
            nativeU64(Number(lockId)),
            addressScVal(recipient),
        ]);

        return res.json({ txHash: (sorobanResult as any).hash || 'ok' });
    } catch (err: any) {
        console.error('[Vault] Release error:', err.message);
        return res.status(500).json({ error: err.message || 'Failed to release lock' });
    }
});

// POST /api/wallets/:userId/vault/reclaim
router.post('/:userId/vault/reclaim', async (req: Request, res: Response) => {
    try {
        const { lockId } = req.body;
        if (lockId === undefined) {
            return res.status(400).json({ error: 'lockId is required' });
        }
        const wallet = await getWalletRecord(req.params.userId);
        if (!wallet) return res.status(404).json({ error: 'Wallet not found' });

        const secretKey = decrypt(wallet.encrypted_secret);
        const sorobanResult = await buildAndSubmitSoroban(wallet.public_key, secretKey, VAULT_CONTRACT_ID, 'reclaim', [
            addressScVal(wallet.public_key),
            nativeU64(Number(lockId)),
        ]);

        return res.json({ txHash: (sorobanResult as any).hash || 'ok' });
    } catch (err: any) {
        console.error('[Vault] Reclaim error:', err.message);
        return res.status(500).json({ error: err.message || 'Failed to reclaim lock' });
    }
});

// ─── Strategy Commitment endpoints ───────────────────────────────────────────

// POST /api/wallets/:userId/commit — commit strategy hash on-chain
router.post('/:userId/commit', async (req: Request, res: Response) => {
    try {
        const { commitmentHex } = req.body;
        if (!commitmentHex) {
            return res.status(400).json({ error: 'commitmentHex is required' });
        }
        const wallet = await getWalletRecord(req.params.userId);
        if (!wallet) return res.status(404).json({ error: 'Wallet not found' });

        const secretKey = decrypt(wallet.encrypted_secret);

        const result = await buildAndSubmitSoroban(
            wallet.public_key,
            secretKey,
            STRATEGY_CONTRACT_ID,
            'commit',
            [
                addressScVal(wallet.public_key),
                bytes32ScVal(commitmentHex),
            ],
        );

        let commitId: number | null = null;
        if (result.status === 'SUCCESS' && result.returnValue) {
            commitId = Number(StellarSdk.scValToNative(result.returnValue));
        }
        return res.json({ commitId });
    } catch (err: any) {
        console.error('[Strategy] Commit error:', err.message);
        return res.status(500).json({ error: err.message || 'Failed to commit strategy' });
    }
});

// ─── Proof Attachment endpoints ──────────────────────────────────────────────

function bytesScVal(hex: string): StellarSdk.xdr.ScVal {
    return StellarSdk.xdr.ScVal.scvBytes(Buffer.from(hex, 'hex'));
}

function bytes32ScVal(hex: string): StellarSdk.xdr.ScVal {
    return StellarSdk.nativeToScVal(Buffer.from(hex, 'hex'), { type: 'bytes' });
}

// POST /api/wallets/:userId/proofs/attach
router.post('/:userId/proofs/attach', async (req: Request, res: Response) => {
    try {
        const { proofHashHex, commitId, txHash } = req.body;
        if (!proofHashHex || commitId === undefined || !txHash) {
            return res.status(400).json({ error: 'proofHashHex, commitId, and txHash are required' });
        }
        const wallet = await getWalletRecord(req.params.userId);
        if (!wallet) return res.status(404).json({ error: 'Wallet not found' });

        const secretKey = decrypt(wallet.encrypted_secret);

        const result = await buildAndSubmitSoroban(
            wallet.public_key,
            secretKey,
            STRATEGY_CONTRACT_ID,
            'attach_proof',
            [
                addressScVal(wallet.public_key),
                bytes32ScVal(proofHashHex),
                nativeU64(Number(commitId)),
                bytesScVal(Buffer.from(txHash).toString('hex')),
            ],
        );

        let proofId: number | null = null;
        if (result.status === 'SUCCESS' && result.returnValue) {
            proofId = Number(StellarSdk.scValToNative(result.returnValue));
        }
        return res.json({ proofId });
    } catch (err: any) {
        console.error('[Proof] Attach error:', err.message);
        return res.status(500).json({ error: err.message || 'Failed to attach proof' });
    }
});

// GET /api/wallets/:userId/proofs/:proofId
router.get('/:userId/proofs/:proofId', async (req: Request, res: Response) => {
    try {
        const wallet = await getWalletRecord(req.params.userId);
        if (!wallet) return res.status(404).json({ error: 'Wallet not found' });

        const retval = await simulateReadOnly(
            wallet.public_key,
            STRATEGY_CONTRACT_ID,
            'get_proof',
            [nativeU64(Number(req.params.proofId))],
        );
        if (!retval) return res.status(404).json({ error: 'Proof not found' });

        const raw = StellarSdk.scValToNative(retval);
        return res.json({
            owner: raw.owner,
            proofHash: raw.proof_hash ? Buffer.from(raw.proof_hash).toString('hex') : '',
            commitId: Number(raw.commit_id),
            txHash: raw.tx_hash ? Buffer.from(raw.tx_hash).toString('utf8') : '',
            revealed: raw.revealed,
            strategy: raw.strategy ? Buffer.from(raw.strategy).toString('utf8') : '',
            tradeParams: raw.trade_params ? Buffer.from(raw.trade_params).toString('utf8') : '',
            timestamp: Number(raw.timestamp),
        });
    } catch (err: any) {
        console.error('[Proof] Get error:', err.message);
        return res.status(500).json({ error: 'Failed to fetch proof' });
    }
});

// POST /api/wallets/:userId/proofs/:proofId/reveal
router.post('/:userId/proofs/:proofId/reveal', async (req: Request, res: Response) => {
    try {
        const { strategy, tradeParams, salt } = req.body;
        if (!strategy || !tradeParams || !salt) {
            return res.status(400).json({ error: 'strategy, tradeParams, and salt are required' });
        }
        const wallet = await getWalletRecord(req.params.userId);
        if (!wallet) return res.status(404).json({ error: 'Wallet not found' });

        const secretKey = decrypt(wallet.encrypted_secret);

        await buildAndSubmitSoroban(
            wallet.public_key,
            secretKey,
            STRATEGY_CONTRACT_ID,
            'reveal_proof',
            [
                nativeU64(Number(req.params.proofId)),
                bytesScVal(Buffer.from(strategy).toString('hex')),
                bytesScVal(Buffer.from(tradeParams).toString('hex')),
                bytesScVal(Buffer.from(salt, 'hex').toString('hex')),
            ],
        );

        return res.json({ success: true });
    } catch (err: any) {
        console.error('[Proof] Reveal error:', err.message);
        return res.status(500).json({ error: err.message || 'Failed to reveal proof' });
    }
});

async function getBalance(publicKey: string): Promise<string> {
    try {
        const account = await horizon.loadAccount(publicKey);
        const native = account.balances.find(
            (b: any) => b.asset_type === 'native'
        );
        return native ? native.balance : '0';
    } catch {
        return '0';
    }
}

export { router as walletRouter };