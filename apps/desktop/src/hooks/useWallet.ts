import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './useAuth';
import { createWallet, getWallet, sendXLM, getTransactions, checkTrustline, addTrustline, getSwapQuote, executeSwap, getVaultBalance, vaultDeposit, vaultWithdraw, vaultLock, attachProof, revealProof as revealProofApi, commitStrategy } from '../services/walletApi';
import type { Transaction } from '../services/walletApi';
import { generateProof, saveProofBundle, loadProofBundle, encodeTradeParams } from '../services/proofAttachment';
import { computeCommitment, generateSalt, toHex } from '../services/strategyCommitment';
import type { ProofBundle } from '../services/proofAttachment';

interface SendState {
    status: 'idle' | 'loading' | 'success' | 'error';
    txHash?: string;
    error?: string;
}

interface TradeState {
    status: 'idle' | 'quoting' | 'quoted' | 'swapping' | 'success' | 'error';
    quote?: string;
    txHash?: string;
    error?: string;
}

interface VaultState {
    status: 'idle' | 'loading' | 'success' | 'error';
    txHash?: string;
    error?: string;
    lockId?: number | null;
}

interface ProofState {
    status: 'idle' | 'loading' | 'success' | 'error';
    proofId?: number | null;
    proofHashHex?: string;
    error?: string;
}

export function useWallet() {
    const { userId, authenticated } = useAuth();
    const [address, setAddress] = useState<string | null>(null);
    const [balance, setBalance] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sendState, setSendState] = useState<SendState>({ status: 'idle' });
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [txLoading, setTxLoading] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    // Ref to guard against state updates in fire-and-forget callbacks (send, initWallet)
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    // Main data-fetching effect — only depends on primitive userId + refreshKey
    useEffect(() => {
        if (!authenticated || !userId) {
            setAddress(null);
            setBalance(null);
            setError(null);
            setTransactions([]);
            return;
        }

        let cancelled = false;

        async function load() {
            setIsLoading(true);
            setError(null);
            let walletAddress: string | null = null;

            try {
                const wallet = await getWallet(userId!);
                if (!cancelled) {
                    setAddress(wallet.address);
                    setBalance(wallet.balance);
                    walletAddress = wallet.address;
                }
            } catch (err: any) {
                if (!cancelled) {
                    console.error('[useWallet] fetchWallet error:', err);
                    if (err.message?.includes('not found') || err.message?.includes('404')) {
                        setAddress(null);
                        setBalance(null);
                    } else {
                        setError(err.message || 'Failed to fetch wallet');
                    }
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }

            // Fetch transactions (falls back to direct Horizon if backend is offline)
            try {
                if (!cancelled) setTxLoading(true);
                const txs = await getTransactions(userId!, walletAddress ?? undefined);
                if (!cancelled) setTransactions(txs);
            } catch (err: any) {
                if (!cancelled) {
                    console.error('[useWallet] fetchTransactions error:', err);
                    setTransactions([]);
                }
            } finally {
                if (!cancelled) setTxLoading(false);
            }
        }

        load();

        return () => { cancelled = true; };
    }, [userId, authenticated, refreshKey]);

    const refresh = useCallback(() => {
        setRefreshKey(k => k + 1);
    }, []);

    const initWallet = useCallback(async () => {
        if (!userId) return;
        setIsLoading(true);
        setError(null);
        try {
            const wallet = await createWallet(userId);
            if (!mountedRef.current) return;
            setAddress(wallet.address);
            setBalance(wallet.balance);
            // Trigger a refresh to load transactions
            setRefreshKey(k => k + 1);
        } catch (err: any) {
            if (!mountedRef.current) return;
            console.error('[useWallet] initWallet error:', err);
            setError(err.message || 'Failed to create wallet');
        } finally {
            if (mountedRef.current) setIsLoading(false);
        }
    }, [userId]);

    const send = useCallback(async (to: string, amount: string) => {
        if (!userId) return;
        setSendState({ status: 'loading' });
        try {
            const result = await sendXLM(userId, to, amount);
            if (!mountedRef.current) return;
            setBalance(result.balance);
            setSendState({ status: 'success', txHash: result.txHash });
            // Refresh transactions after send
            setRefreshKey(k => k + 1);
        } catch (err: any) {
            if (!mountedRef.current) return;
            console.error('[useWallet] send error:', err);
            setSendState({ status: 'error', error: err.message || 'Failed to send XLM' });
        }
    }, [userId]);

    const resetSendState = useCallback(() => {
        setSendState({ status: 'idle' });
    }, []);

    // --- Trade / Swap state ---
    const [tradeState, setTradeState] = useState<TradeState>({ status: 'idle' });
    const [hasTrustline, setHasTrustline] = useState<boolean | null>(null);
    const [trustlineLoading, setTrustlineLoading] = useState(false);

    const checkUsdcTrustline = useCallback(async () => {
        if (!userId) return;
        setTrustlineLoading(true);
        try {
            const result = await checkTrustline(userId);
            if (mountedRef.current) setHasTrustline(result.hasTrustline);
        } catch (err: any) {
            if (mountedRef.current) {
                console.error('[useWallet] trustline check error:', err);
                setHasTrustline(false);
            }
        } finally {
            if (mountedRef.current) setTrustlineLoading(false);
        }
    }, [userId]);

    const enableTrustline = useCallback(async () => {
        if (!userId) return;
        setTrustlineLoading(true);
        try {
            await addTrustline(userId);
            if (mountedRef.current) setHasTrustline(true);
        } catch (err: any) {
            if (mountedRef.current) {
                console.error('[useWallet] enable trustline error:', err);
                setTradeState({ status: 'error', error: err.message || 'Failed to enable USDC trustline' });
            }
        } finally {
            if (mountedRef.current) setTrustlineLoading(false);
        }
    }, [userId]);

    const fetchQuote = useCallback(async (amount: string) => {
        if (!userId) return;
        setTradeState({ status: 'quoting' });
        try {
            const result = await getSwapQuote(userId, amount);
            if (mountedRef.current) {
                setTradeState({ status: 'quoted', quote: result.destinationAmount });
            }
        } catch (err: any) {
            if (mountedRef.current) {
                setTradeState({ status: 'error', error: err.message || 'Failed to get quote' });
            }
        }
    }, [userId]);

    const swap = useCallback(async (amount: string, minDestAmount: string) => {
        if (!userId) return;
        setTradeState(prev => ({ ...prev, status: 'swapping' }));
        try {
            const result = await executeSwap(userId, amount, minDestAmount);
            if (mountedRef.current) {
                setBalance(result.balance);
                setTradeState({ status: 'success', txHash: result.txHash });
                setRefreshKey(k => k + 1);
            }
        } catch (err: any) {
            if (mountedRef.current) {
                setTradeState({ status: 'error', error: err.message || 'Swap failed' });
            }
        }
    }, [userId]);

    /** Full chain: commit strategy → execute swap → attach proof (when privateMode ON) */
    const swapWithProof = useCallback(async (
        amount: string,
        minDestAmount: string,
        strategyNote: string,
    ) => {
        if (!userId) return;
        setTradeState(prev => ({ ...prev, status: 'swapping' }));
        setProofState({ status: 'loading' });
        try {
            // 1. Compute commitment hash: sha256(strategy || salt)
            const salt = generateSalt();
            const commitment = await computeCommitment(strategyNote, salt);
            const commitmentHex = toHex(commitment);

            // 2. Commit on-chain
            const commitResult = await commitStrategy(userId, commitmentHex);
            const commitId = commitResult.commitId;

            // 3. Execute the swap
            const swapResult = await executeSwap(userId, amount, minDestAmount);
            if (!mountedRef.current) return;
            setBalance(swapResult.balance);
            setTradeState({ status: 'success', txHash: swapResult.txHash });
            setRefreshKey(k => k + 1);

            // 4. Generate proof bundle & attach on-chain
            const tradeParamsObj = {
                action: 'swap',
                asset: 'XLM',
                amount,
                destAsset: 'USDC',
                destAmount: minDestAmount,
            };
            const tradeParamsStr = encodeTradeParams(tradeParamsObj);
            const bundle = await generateProof(strategyNote, tradeParamsStr);

            const proofResult = await attachProof(userId, bundle.proofHashHex, commitId, swapResult.txHash);
            if (!mountedRef.current) return;

            if (proofResult.proofId !== null && proofResult.proofId !== undefined) {
                saveProofBundle(proofResult.proofId, bundle);
            }

            setProofState({
                status: 'success',
                proofId: proofResult.proofId,
                proofHashHex: bundle.proofHashHex,
            });
        } catch (err: any) {
            if (!mountedRef.current) return;
            console.error('[useWallet] swapWithProof error:', err);
            // If swap already succeeded but proof failed, keep swap success
            if (tradeState.status === 'success') {
                setProofState({ status: 'error', error: err.message || 'Proof attachment failed' });
            } else {
                setTradeState({ status: 'error', error: err.message || 'Swap with proof failed' });
                setProofState({ status: 'idle' });
            }
        }
    }, [userId, tradeState.status]);

    const resetTradeState = useCallback(() => {
        setTradeState({ status: 'idle' });
    }, []);

    // --- Vault state ---
    const [vaultBalance, setVaultBalance] = useState<string | null>(null);
    const [vaultLoading, setVaultLoading] = useState(false);
    const [vaultState, setVaultState] = useState<VaultState>({ status: 'idle' });

    const refreshVaultBalance = useCallback(async () => {
        if (!userId) return;
        setVaultLoading(true);
        try {
            const result = await getVaultBalance(userId);
            if (mountedRef.current) setVaultBalance(result.balance);
        } catch (err: any) {
            if (mountedRef.current) {
                console.error('[useWallet] vault balance error:', err);
                setVaultBalance('0');
            }
        } finally {
            if (mountedRef.current) setVaultLoading(false);
        }
    }, [userId]);

    const depositToVault = useCallback(async (amount: string) => {
        if (!userId) return;
        setVaultState({ status: 'loading' });
        try {
            const result = await vaultDeposit(userId, amount);
            if (!mountedRef.current) return;
            setBalance(result.balance);
            setVaultState({ status: 'success', txHash: result.txHash });
            refreshVaultBalance();
        } catch (err: any) {
            if (!mountedRef.current) return;
            setVaultState({ status: 'error', error: err.message || 'Deposit failed' });
        }
    }, [userId, refreshVaultBalance]);

    const withdrawFromVault = useCallback(async (amount: string) => {
        if (!userId) return;
        setVaultState({ status: 'loading' });
        try {
            const result = await vaultWithdraw(userId, amount);
            if (!mountedRef.current) return;
            setBalance(result.balance);
            setVaultState({ status: 'success', txHash: result.txHash });
            refreshVaultBalance();
        } catch (err: any) {
            if (!mountedRef.current) return;
            setVaultState({ status: 'error', error: err.message || 'Withdraw failed' });
        }
    }, [userId, refreshVaultBalance]);

    const lockInVault = useCallback(async (amount: string, lockMinutes: number) => {
        if (!userId) return;
        setVaultState({ status: 'loading' });
        try {
            const result = await vaultLock(userId, amount, lockMinutes);
            if (!mountedRef.current) return;
            setVaultState({ status: 'success', txHash: result.txHash, lockId: result.lockId });
            refreshVaultBalance();
        } catch (err: any) {
            if (!mountedRef.current) return;
            setVaultState({ status: 'error', error: err.message || 'Lock failed' });
        }
    }, [userId, refreshVaultBalance]);

    const resetVaultState = useCallback(() => {
        setVaultState({ status: 'idle' });
    }, []);

    // --- Proof Attachments state ---
    const [privateMode, setPrivateMode] = useState<boolean>(() => {
        try { return localStorage.getItem('haloai_private_mode') === 'true'; } catch { return false; }
    });
    const [proofState, setProofState] = useState<ProofState>({ status: 'idle' });

    const togglePrivateMode = useCallback(() => {
        setPrivateMode(prev => {
            const next = !prev;
            try { localStorage.setItem('haloai_private_mode', String(next)); } catch {}
            return next;
        });
    }, []);

    const attachProofToTrade = useCallback(async (
        strategy: string,
        tradeParamsObj: { action: string; asset: string; amount: string; destAsset?: string; destAmount?: string },
        commitId: number,
        txHash: string,
    ) => {
        if (!userId) return;
        setProofState({ status: 'loading' });
        try {
            const tradeParamsStr = encodeTradeParams(tradeParamsObj);
            const bundle = await generateProof(strategy, tradeParamsStr);

            const result = await attachProof(userId, bundle.proofHashHex, commitId, txHash);
            if (!mountedRef.current) return;

            if (result.proofId !== null && result.proofId !== undefined) {
                saveProofBundle(result.proofId, bundle);
            }

            setProofState({
                status: 'success',
                proofId: result.proofId,
                proofHashHex: bundle.proofHashHex,
            });
        } catch (err: any) {
            if (!mountedRef.current) return;
            setProofState({ status: 'error', error: err.message || 'Failed to attach proof' });
        }
    }, [userId]);

    const revealTradeProof = useCallback(async (proofId: number) => {
        if (!userId) return;
        setProofState({ status: 'loading' });
        try {
            const bundle = loadProofBundle(proofId);
            if (!bundle) throw new Error('Proof bundle not found locally. Cannot reveal without the original strategy, trade params, and salt.');

            await revealProofApi(userId, proofId, bundle.strategy, bundle.tradeParams, bundle.saltHex);
            if (!mountedRef.current) return;
            setProofState({ status: 'success', proofId });
        } catch (err: any) {
            if (!mountedRef.current) return;
            setProofState({ status: 'error', error: err.message || 'Failed to reveal proof' });
        }
    }, [userId]);

    const resetProofState = useCallback(() => {
        setProofState({ status: 'idle' });
    }, []);

    return {
        address,
        balance,
        isLoading,
        error,
        sendState,
        transactions,
        txLoading,
        initWallet,
        send,
        refresh,
        resetSendState,
        // Trade
        tradeState,
        hasTrustline,
        trustlineLoading,
        checkUsdcTrustline,
        enableTrustline,
        fetchQuote,
        swap,
        swapWithProof,
        resetTradeState,
        // Vault
        vaultBalance,
        vaultLoading,
        vaultState,
        refreshVaultBalance,
        depositToVault,
        withdrawFromVault,
        lockInVault,
        resetVaultState,
        // Proof Attachments
        privateMode,
        proofState,
        togglePrivateMode,
        attachProofToTrade,
        revealTradeProof,
        resetProofState,
    };
}
