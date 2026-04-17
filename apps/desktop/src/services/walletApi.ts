const WALLETS_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/wallets';

async function safeFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
    try {
        return await fetch(input, init);
    } catch (err) {
        // TypeError: Failed to fetch — network error / connection refused
        throw new Error('Connection error — is the server running?');
    }
}

async function parseErrorBody(res: Response): Promise<string> {
    try {
        const body = await res.json();
        return body.error || `Request failed (${res.status})`;
    } catch {
        return `Request failed (${res.status})`;
    }
}

export async function createWallet(privyUserId: string): Promise<{ address: string; balance: string }> {
    const res = await safeFetch(WALLETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privyUserId }),
    });
    if (!res.ok) throw new Error(await parseErrorBody(res));
    return res.json();
}

export async function getWallet(userId: string): Promise<{ address: string; balance: string }> {
    const res = await safeFetch(`${WALLETS_URL}/${userId}`);
    if (!res.ok) throw new Error(await parseErrorBody(res));
    return res.json();
}

export async function sendXLM(
    userId: string,
    to: string,
    amount: string
): Promise<{ txHash: string; balance: string }> {
    const res = await safeFetch(`${WALLETS_URL}/${userId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, amount }),
    });
    if (!res.ok) throw new Error(await parseErrorBody(res));
    return res.json();
}

export interface Transaction {
    id: string;
    type: 'sent' | 'received' | 'trade';
    amount: string;
    asset: string;
    from: string;
    to: string;
    date: string;
    txHash: string;
    // Trade-specific (present when type === 'trade')
    sourceAsset?: string;
    sourceAmount?: string;
}

const HORIZON_BASE = 'https://horizon-testnet.stellar.org';
const VALID_OP_TYPES = ['payment', 'create_account', 'path_payment_strict_send', 'path_payment_strict_receive'];

function parseHorizonPayment(r: any, walletAddress: string): Transaction {
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
    const isSent = r.from === walletAddress;
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
}

async function fetchTransactionsFromHorizon(address: string): Promise<Transaction[]> {
    const res = await fetch(`${HORIZON_BASE}/accounts/${address}/payments?order=desc&limit=20`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data._embedded?.records || [])
        .filter((r: any) => VALID_OP_TYPES.includes(r.type))
        .map((r: any) => parseHorizonPayment(r, address));
}

export async function getTransactions(userId: string, address?: string): Promise<Transaction[]> {
    try {
        const res = await safeFetch(`${WALLETS_URL}/${userId}/transactions`);
        if (!res.ok) return [];
        const data = await res.json();
        return data.transactions;
    } catch {
        // Backend unreachable — fall back to direct Horizon
        if (address) return fetchTransactionsFromHorizon(address);
        return [];
    }
}

export async function checkTrustline(userId: string): Promise<{ hasTrustline: boolean; balances: any[] }> {
    const res = await safeFetch(`${WALLETS_URL}/${userId}/trustlines`);
    if (!res.ok) throw new Error(await parseErrorBody(res));
    return res.json();
}

export async function addTrustline(userId: string): Promise<{ txHash: string; success: boolean }> {
    const res = await safeFetch(`${WALLETS_URL}/${userId}/trustline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error(await parseErrorBody(res));
    return res.json();
}

export async function getSwapQuote(
    userId: string,
    amount: string
): Promise<{ destinationAmount: string; path: any[]; sourceAmount: string }> {
    const res = await safeFetch(`${WALLETS_URL}/${userId}/swap-quote?amount=${encodeURIComponent(amount)}`);
    if (!res.ok) {
        const errMsg = await parseErrorBody(res);
        throw new Error(errMsg);
    }
    return res.json();
}

export async function executeSwap(
    userId: string,
    amount: string,
    minDestAmount: string
): Promise<{ txHash: string; balance: string }> {
    const res = await safeFetch(`${WALLETS_URL}/${userId}/swap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, minDestAmount }),
    });
    if (!res.ok) throw new Error(await parseErrorBody(res));
    return res.json();
}

// ─── Strategy Commitment API ─────────────────────────────────────────────────

export async function commitStrategy(
    userId: string,
    commitmentHex: string,
): Promise<{ commitId: number }> {
    const res = await safeFetch(`${WALLETS_URL}/${userId}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commitmentHex }),
    });
    if (!res.ok) throw new Error(await parseErrorBody(res));
    return res.json();
}

// ─── Vault API ───────────────────────────────────────────────────────────────

export async function getVaultBalance(userId: string): Promise<{ balance: string }> {
    const res = await safeFetch(`${WALLETS_URL}/${userId}/vault/balance`);
    if (!res.ok) throw new Error(await parseErrorBody(res));
    return res.json();
}

export async function vaultDeposit(
    userId: string,
    amount: string,
): Promise<{ txHash: string; balance: string }> {
    const res = await safeFetch(`${WALLETS_URL}/${userId}/vault/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
    });
    if (!res.ok) throw new Error(await parseErrorBody(res));
    return res.json();
}

export async function vaultWithdraw(
    userId: string,
    amount: string,
): Promise<{ txHash: string; balance: string }> {
    const res = await safeFetch(`${WALLETS_URL}/${userId}/vault/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
    });
    if (!res.ok) throw new Error(await parseErrorBody(res));
    return res.json();
}

export async function vaultLock(
    userId: string,
    amount: string,
    lockMinutes: number,
): Promise<{ txHash: string; lockId: number | null }> {
    const res = await safeFetch(`${WALLETS_URL}/${userId}/vault/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, lockMinutes }),
    });
    if (!res.ok) throw new Error(await parseErrorBody(res));
    return res.json();
}

export async function vaultGetLock(
    userId: string,
    lockId: number,
): Promise<{ token: string; amount: string; expiresAt: number; status: string }> {
    const res = await safeFetch(`${WALLETS_URL}/${userId}/vault/lock/${lockId}`);
    if (!res.ok) throw new Error(await parseErrorBody(res));
    return res.json();
}

export async function vaultRelease(
    userId: string,
    lockId: number,
    recipient: string,
): Promise<{ txHash: string }> {
    const res = await safeFetch(`${WALLETS_URL}/${userId}/vault/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lockId, recipient }),
    });
    if (!res.ok) throw new Error(await parseErrorBody(res));
    return res.json();
}

export async function vaultReclaim(
    userId: string,
    lockId: number,
): Promise<{ txHash: string }> {
    const res = await safeFetch(`${WALLETS_URL}/${userId}/vault/reclaim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lockId }),
    });
    if (!res.ok) throw new Error(await parseErrorBody(res));
    return res.json();
}

// ─── Proof Attachment API ─────────────────────────────────────────────────────

export async function attachProof(
    userId: string,
    proofHashHex: string,
    commitId: number,
    txHash: string,
): Promise<{ proofId: number }> {
    const res = await safeFetch(`${WALLETS_URL}/${userId}/proofs/attach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proofHashHex, commitId, txHash }),
    });
    if (!res.ok) throw new Error(await parseErrorBody(res));
    return res.json();
}

export interface ProofRecordResponse {
    owner: string;
    proofHash: string;
    commitId: number;
    txHash: string;
    revealed: boolean;
    strategy: string;
    tradeParams: string;
    timestamp: number;
}

export async function getProof(
    userId: string,
    proofId: number,
): Promise<ProofRecordResponse> {
    const res = await safeFetch(`${WALLETS_URL}/${userId}/proofs/${proofId}`);
    if (!res.ok) throw new Error(await parseErrorBody(res));
    return res.json();
}

export async function revealProof(
    userId: string,
    proofId: number,
    strategy: string,
    tradeParams: string,
    salt: string,
): Promise<{ success: boolean }> {
    const res = await safeFetch(`${WALLETS_URL}/${userId}/proofs/${proofId}/reveal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy, tradeParams, salt }),
    });
    if (!res.ok) throw new Error(await parseErrorBody(res));
    return res.json();
}

export async function getHorizonAccount(address: string) {
    const res = await fetch(`https://horizon-testnet.stellar.org/accounts/${address}`);
    if (!res.ok) throw new Error('Failed to fetch account from Horizon');
    return res.json();
}
