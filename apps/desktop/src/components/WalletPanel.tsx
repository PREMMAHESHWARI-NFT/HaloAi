import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useWallet } from '../hooks/useWallet';
import WalletSendForm from './WalletSendForm';

type TabId = 'wallet' | 'trade' | 'vault';

interface WalletPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function WalletPanel({ isOpen, onClose }: WalletPanelProps) {
    const { ready, authenticated, login, logout } = useAuth();
    const {
        address, balance, isLoading, error, sendState, transactions, txLoading,
        initWallet, send, refresh, resetSendState,
        tradeState, hasTrustline, trustlineLoading,
        checkUsdcTrustline, enableTrustline, fetchQuote, swap, swapWithProof, resetTradeState,
        vaultBalance, vaultLoading, vaultState,
        refreshVaultBalance, depositToVault, withdrawFromVault, lockInVault, resetVaultState,
        privateMode, proofState, togglePrivateMode, attachProofToTrade, revealTradeProof, resetProofState,
    } = useWallet();
    const [copied, setCopied] = useState(false);
    const [activeTab, setActiveTab] = useState<TabId>('wallet');
    const [swapAmount, setSwapAmount] = useState('');
    const [vaultAmount, setVaultAmount] = useState('');
    const [lockAmount, setLockAmount] = useState('');
    const [lockExpiry, setLockExpiry] = useState('');
    const [strategyNote, setStrategyNote] = useState('');
    const [proofsCopied, setProofsCopied] = useState(false);
    const [showProofHistory, setShowProofHistory] = useState(false);
    const [showStampInfo, setShowStampInfo] = useState(false);
    const [expandedStampId, setExpandedStampId] = useState<number | null>(null);
    const [revealedProofIds, setRevealedProofIds] = useState<Set<number>>(new Set());

    type TxFilter = 'all' | 'payments' | 'trades';
    const [txFilter, setTxFilter] = useState<TxFilter>('all');

    const filteredTransactions = transactions.filter(tx => {
        if (txFilter === 'all') return true;
        if (txFilter === 'payments') return tx.type === 'sent' || tx.type === 'received';
        if (txFilter === 'trades') return tx.type === 'trade';
        return true;
    });

    // Check trustline when Trade tab opens
    useEffect(() => {
        if (activeTab === 'trade' && address && hasTrustline === null) {
            checkUsdcTrustline();
        }
    }, [activeTab, address, hasTrustline, checkUsdcTrustline]);

    // Fetch vault balance when Vault tab opens
    useEffect(() => {
        if (activeTab === 'vault' && address && vaultBalance === null) {
            refreshVaultBalance();
        }
    }, [activeTab, address, vaultBalance, refreshVaultBalance]);

    if (!isOpen) return null;

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) onClose();
    };

    const copyAddress = async () => {
        if (!address) return;
        await navigator.clipboard.writeText(address);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const truncatedAddress = address
        ? `${address.slice(0, 6)}...${address.slice(-4)}`
        : null;

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        const now = new Date();
        const diff = now.getTime() - d.getTime();
        const mins = Math.floor(diff / 60000);
        const hrs = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        if (hrs < 24) return `${hrs}h ago`;
        if (days < 7) return `${days}d ago`;
        return d.toLocaleDateString();
    };

    const truncateAddr = (addr: string) => `${addr.slice(0, 4)}...${addr.slice(-4)}`;

    return (
        <div
            className="fixed inset-0 flex items-center justify-center animate-fade-in"
            style={{
                zIndex: 999999,
                pointerEvents: 'auto',
                WebkitAppRegion: 'no-drag',
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                backdropFilter: 'blur(4px)',
            } as any}
            onClick={handleBackdropClick}
            onMouseDown={handleBackdropClick}
        >
            <div
                style={{
                    position: 'relative',
                    background: 'rgba(10, 10, 12, 0.95)',
                    backdropFilter: 'blur(30px)',
                    borderRadius: '1rem',
                    padding: '1.25rem',
                    width: '460px',
                    maxWidth: '90vw',
                    maxHeight: '85vh',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.08)',
                    pointerEvents: 'auto',
                    WebkitAppRegion: 'no-drag',
                    zIndex: 1000000,
                } as any}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                className="animate-scale-in"
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2.5">
                        <div className="p-1.5 bg-white/5 rounded-lg border border-white/5">
                            <svg className="w-4 h-4 text-white/90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
                            </svg>
                        </div>
                        <h2 className="text-base font-medium text-white/90 tracking-wide">Wallet</h2>
                    </div>
                    <button
                        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
                        onClick={(e) => { e.stopPropagation(); onClose(); }}
                        className="force-clickable text-white/40 hover:text-white/80 transition-colors p-1"
                        style={{ pointerEvents: 'auto', cursor: 'pointer', WebkitAppRegion: 'no-drag', zIndex: 10001 } as any}
                        type="button"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ pointerEvents: 'none' }}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Tab bar — only show when wallet exists */}
                {ready && authenticated && address && (
                    <div className="flex gap-1 mb-4 p-0.5 bg-white/[0.03] rounded-lg border border-white/[0.06]">
                        {(['wallet', 'trade', 'vault'] as TabId[]).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                                    activeTab === tab
                                        ? 'bg-white/10 text-white/90 shadow-sm'
                                        : 'text-white/40 hover:text-white/60'
                                }`}
                                style={{ pointerEvents: 'auto', WebkitAppRegion: 'no-drag' } as any}
                                type="button"
                            >
                                {tab === 'wallet' ? 'Wallet' : tab === 'trade' ? 'Trade' : 'Vault'}
                            </button>
                        ))}
                    </div>
                )}

                {/* Scrollable content */}
                <div className="overflow-y-auto flex-1 space-y-4" style={{ maxHeight: 'calc(85vh - 80px)' }}>
                    {!ready && (
                        <div className="flex justify-center py-8">
                            <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                        </div>
                    )}

                    {/* Not authenticated */}
                    {ready && !authenticated && (
                        <div className="text-center space-y-4 py-4">
                            <p className="text-white/40 text-sm font-light">Sign in to access your Stellar wallet.</p>
                            <button
                                onClick={login}
                                className="w-full px-4 py-3 bg-white text-black rounded-xl font-medium text-sm hover:bg-white/90 shadow-lg shadow-white/5 transition-all"
                                style={{ pointerEvents: 'auto', WebkitAppRegion: 'no-drag' } as any}
                                type="button"
                            >
                                Sign In
                            </button>
                        </div>
                    )}

                    {/* Authenticated, no wallet */}
                    {ready && authenticated && !address && !isLoading && (
                        <div className="text-center space-y-4 py-4">
                            {error ? (
                                <>
                                    <div className="p-3 bg-red-500/10 border border-red-500/10 rounded-lg">
                                        <p className="text-red-300 text-xs">{error}</p>
                                    </div>
                                    <button
                                        onClick={refresh}
                                        className="w-full px-4 py-3 bg-white/10 text-white/80 rounded-xl font-medium text-sm hover:bg-white/15 transition-all"
                                        style={{ pointerEvents: 'auto', WebkitAppRegion: 'no-drag' } as any}
                                        type="button"
                                    >
                                        Retry
                                    </button>
                                </>
                            ) : (
                                <>
                                    <p className="text-white/40 text-sm font-light">Create a Stellar wallet to send and receive XLM.</p>
                                    <button
                                        onClick={initWallet}
                                        className="w-full px-4 py-3 bg-white text-black rounded-xl font-medium text-sm hover:bg-white/90 shadow-lg shadow-white/5 transition-all"
                                        style={{ pointerEvents: 'auto', WebkitAppRegion: 'no-drag' } as any}
                                        type="button"
                                    >
                                        Create Stellar Wallet
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    {/* Loading */}
                    {ready && authenticated && isLoading && !address && (
                        <div className="flex justify-center py-8">
                            <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                        </div>
                    )}

                    {/* Wallet exists — Wallet tab */}
                    {ready && authenticated && address && activeTab === 'wallet' && (
                        <>
                            {/* Balance card with address */}
                            <div className="p-4 bg-white/[0.03] rounded-xl border border-white/[0.06]">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <span className="text-xs text-white/40 font-light block mb-1">Balance</span>
                                        <span className="text-2xl text-white/95 font-semibold tracking-tight">
                                            {balance ? parseFloat(balance).toFixed(7) : '—'}
                                        </span>
                                        <span className="text-sm text-white/40 ml-1.5">XLM</span>
                                    </div>
                                    <button
                                        onClick={refresh}
                                        disabled={isLoading}
                                        className="text-white/30 hover:text-white/70 transition-colors p-1.5 rounded-md hover:bg-white/5"
                                        title="Refresh"
                                        type="button"
                                        style={{ pointerEvents: 'auto', WebkitAppRegion: 'no-drag' } as any}
                                    >
                                        <svg className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                    </button>
                                </div>
                                <div className="mt-3 pt-3 border-t border-white/[0.04] flex items-center justify-between">
                                    <span className="text-[11px] text-white/40 font-mono">{truncatedAddress}</span>
                                    <button
                                        onClick={copyAddress}
                                        className="text-white/30 hover:text-white/70 transition-colors p-1 rounded"
                                        title="Copy full address"
                                        type="button"
                                        style={{ pointerEvents: 'auto', WebkitAppRegion: 'no-drag' } as any}
                                    >
                                        {copied ? (
                                            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                        ) : (
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Send section */}
                            <div>
                                <label className="block text-xs font-medium text-white/60 mb-2">Send XLM</label>
                                <WalletSendForm onSend={send} sendState={sendState} onReset={resetSendState} />
                            </div>

                            {/* Transaction History */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-medium text-white/60">Recent Transactions</label>
                                    <div className="flex gap-1">
                                        {(['all', 'payments', 'trades'] as TxFilter[]).map(f => (
                                            <button
                                                key={f}
                                                onClick={() => setTxFilter(f)}
                                                className={`px-2 py-0.5 text-[10px] rounded-md transition-all ${
                                                    txFilter === f
                                                        ? 'bg-white/10 text-white/80'
                                                        : 'text-white/30 hover:text-white/50'
                                                }`}
                                                style={{ pointerEvents: 'auto', WebkitAppRegion: 'no-drag' } as any}
                                                type="button"
                                            >
                                                {f === 'all' ? 'All' : f === 'payments' ? 'Payments' : 'Trades'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {txLoading && transactions.length === 0 && (
                                    <div className="flex justify-center py-4">
                                        <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                                    </div>
                                )}
                                {!txLoading && filteredTransactions.length === 0 && (
                                    <div className="text-center py-4">
                                        <p className="text-white/20 text-xs">
                                            {txFilter === 'all' ? 'No transactions yet' : `No ${txFilter} yet`}
                                        </p>
                                    </div>
                                )}
                                {filteredTransactions.length > 0 && (
                                    <div className="space-y-1.5">
                                        {filteredTransactions.slice(0, 10).map((tx) => (
                                            <div
                                                key={tx.id}
                                                className="flex items-center justify-between p-2.5 bg-white/[0.02] rounded-lg border border-white/[0.04] hover:bg-white/[0.04] transition-colors"
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                                                        tx.type === 'trade' ? 'bg-purple-500/10'
                                                        : tx.type === 'sent' ? 'bg-red-500/10' : 'bg-emerald-500/10'
                                                    }`}>
                                                        {tx.type === 'trade' ? (
                                                            <svg className="w-3 h-3 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                                            </svg>
                                                        ) : tx.type === 'sent' ? (
                                                            <svg className="w-3 h-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                                                            </svg>
                                                        ) : (
                                                            <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                                                            </svg>
                                                        )}
                                                    </div>
                                                    <div>
                                                        {tx.type === 'trade' ? (
                                                            <>
                                                                <p className="text-[11px] text-white/70 font-medium">Trade</p>
                                                                <p className="text-[10px] text-white/30">
                                                                    {parseFloat(tx.sourceAmount!).toFixed(7)} {tx.sourceAsset} → {parseFloat(tx.amount).toFixed(7)} {tx.asset}
                                                                </p>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <p className="text-[11px] text-white/70 font-medium">
                                                                    {tx.type === 'sent' ? 'Sent' : 'Received'}
                                                                </p>
                                                                <p className="text-[10px] text-white/30 font-mono">
                                                                    {tx.type === 'sent' ? `To ${truncateAddr(tx.to)}` : `From ${truncateAddr(tx.from)}`}
                                                                </p>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    {tx.type === 'trade' ? (
                                                        <p className="text-[11px] font-medium text-purple-400/80">Swap</p>
                                                    ) : (
                                                        <p className={`text-[11px] font-medium ${
                                                            tx.type === 'sent' ? 'text-red-400/80' : 'text-emerald-400/80'
                                                        }`}>
                                                            {tx.type === 'sent' ? '-' : '+'}{parseFloat(tx.amount).toFixed(7)} {tx.asset}
                                                        </p>
                                                    )}
                                                    <p className="text-[10px] text-white/20">{formatDate(tx.date)}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Sign Out */}
                            <div className="flex justify-center pt-1 pb-1">
                                <button
                                    onClick={logout}
                                    className="force-clickable text-xs text-white/20 hover:text-white/50 transition-colors"
                                    style={{ pointerEvents: 'auto', cursor: 'pointer', WebkitAppRegion: 'no-drag' } as any}
                                    type="button"
                                >
                                    Sign Out
                                </button>
                            </div>
                        </>
                    )}

                    {/* Trade tab */}
                    {ready && authenticated && address && activeTab === 'trade' && (
                        <div className="space-y-4">
                            {/* Trustline gate */}
                            {hasTrustline === null || trustlineLoading ? (
                                <div className="flex justify-center py-6">
                                    <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                                </div>
                            ) : !hasTrustline ? (
                                <div className="p-4 bg-yellow-500/5 border border-yellow-500/10 rounded-xl text-center space-y-3">
                                    <p className="text-yellow-200/80 text-xs">
                                        You need a USDC trustline before you can swap. This reserves 0.5 XLM.
                                    </p>
                                    <button
                                        onClick={enableTrustline}
                                        className="w-full px-4 py-2.5 bg-yellow-500/20 text-yellow-200 rounded-lg font-medium text-xs hover:bg-yellow-500/30 transition-all"
                                        style={{ pointerEvents: 'auto', WebkitAppRegion: 'no-drag' } as any}
                                        type="button"
                                    >
                                        Enable USDC
                                    </button>
                                    {tradeState.status === 'error' && (
                                        <p className="text-red-300 text-[11px]">{tradeState.error}</p>
                                    )}
                                </div>
                            ) : (
                                <>
                                    {/* Strategy Stamp toggle */}
                                    <div className="p-3 bg-white/[0.03] rounded-xl border border-white/[0.06]">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className={`p-1 rounded-md ${privateMode ? 'bg-purple-500/20' : 'bg-white/5'}`}>
                                                    <svg className={`w-3.5 h-3.5 ${privateMode ? 'text-purple-400' : 'text-white/40'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-1.5">
                                                        <p className="text-xs font-medium text-white/80">Strategy Stamp</p>
                                                        <button
                                                            onClick={() => setShowStampInfo(v => !v)}
                                                            className="text-[10px] text-white/30 hover:text-white/60 transition-colors"
                                                            style={{ pointerEvents: 'auto', WebkitAppRegion: 'no-drag' } as any}
                                                            type="button"
                                                        >(?)</button>
                                                    </div>
                                                    <p className="text-[10px] text-white/30">Seal your trading reason before you swap — prove you planned it</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={togglePrivateMode}
                                                className={`relative w-9 h-5 rounded-full transition-all ${
                                                    privateMode ? 'bg-purple-500/40' : 'bg-white/10'
                                                }`}
                                                style={{ pointerEvents: 'auto', WebkitAppRegion: 'no-drag' } as any}
                                                type="button"
                                            >
                                                <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
                                                    privateMode ? 'left-[18px] bg-purple-400' : 'left-0.5 bg-white/40'
                                                }`} />
                                            </button>
                                        </div>
                                        {showStampInfo && (
                                            <p className="mt-2 text-[10px] text-purple-300/50 leading-relaxed">
                                                Before your trade executes, your strategy is timestamped on the blockchain. Nobody can see it unless you choose to reveal it later. This proves you had a plan — not just luck.
                                            </p>
                                        )}
                                    </div>

                                    {/* Strategy note input (visible when stamp mode ON) */}
                                    {privateMode && (
                                        <div className="p-3 bg-purple-500/[0.04] rounded-xl border border-purple-500/10 space-y-2">
                                            <label className="block text-[11px] font-medium text-purple-300/70">What's your trading reason?</label>
                                            <input
                                                type="text"
                                                placeholder='e.g. "RSI is below 30, good entry point"'
                                                value={strategyNote}
                                                onChange={e => setStrategyNote(e.target.value)}
                                                className="w-full bg-white/5 border border-purple-500/10 rounded-lg px-3 py-2 text-sm text-white/90 placeholder:text-white/20 outline-none focus:border-purple-500/20 transition-colors"
                                                style={{ pointerEvents: 'auto', WebkitAppRegion: 'no-drag' } as any}
                                            />
                                            <p className="text-[9px] text-white/25">Stays on your device. Only a fingerprint goes on-chain.</p>
                                        </div>
                                    )}

                                    {/* Swap form */}
                                    <div className="p-4 bg-white/[0.03] rounded-xl border border-white/[0.06] space-y-3">
                                        <label className="block text-xs font-medium text-white/60">Swap XLM → USDC</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="number"
                                                min="0"
                                                step="any"
                                                placeholder="Amount XLM"
                                                value={swapAmount}
                                                onChange={e => {
                                                    setSwapAmount(e.target.value);
                                                    if (tradeState.status !== 'idle') resetTradeState();
                                                }}
                                                className="flex-1 bg-white/5 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/90 placeholder:text-white/20 outline-none focus:border-white/20 transition-colors"
                                                style={{ pointerEvents: 'auto', WebkitAppRegion: 'no-drag' } as any}
                                            />
                                            <button
                                                onClick={() => {
                                                    if (swapAmount && parseFloat(swapAmount) > 0) fetchQuote(swapAmount);
                                                }}
                                                disabled={!swapAmount || parseFloat(swapAmount) <= 0 || tradeState.status === 'quoting'}
                                                className="px-3 py-2 bg-white/10 text-white/80 rounded-lg text-xs font-medium hover:bg-white/15 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                                style={{ pointerEvents: 'auto', WebkitAppRegion: 'no-drag' } as any}
                                                type="button"
                                            >
                                                {tradeState.status === 'quoting' ? 'Quoting...' : 'Get Quote'}
                                            </button>
                                        </div>

                                        {/* Quote display */}
                                        {tradeState.status === 'quoted' && tradeState.quote && (
                                            <div className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-lg space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[11px] text-white/40">You send</span>
                                                    <span className="text-xs text-white/80 font-medium">{parseFloat(swapAmount).toFixed(4)} XLM</span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[11px] text-white/40">You receive (est.)</span>
                                                    <span className="text-xs text-emerald-400/90 font-medium">{parseFloat(tradeState.quote).toFixed(4)} USDC</span>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        if (privateMode && strategyNote.trim()) {
                                                            swapWithProof(swapAmount, tradeState.quote!, strategyNote.trim());
                                                        } else {
                                                            swap(swapAmount, tradeState.quote!);
                                                        }
                                                    }}
                                                    className="w-full mt-1 px-4 py-2.5 bg-emerald-500/20 text-emerald-200 rounded-lg font-medium text-xs hover:bg-emerald-500/30 transition-all"
                                                    style={{ pointerEvents: 'auto', WebkitAppRegion: 'no-drag' } as any}
                                                    type="button"
                                                >
                                                    {privateMode && strategyNote.trim() ? 'Confirm Swap + Stamp Strategy' : 'Confirm Swap'}
                                                </button>
                                            </div>
                                        )}

                                        {/* Swapping spinner */}
                                        {tradeState.status === 'swapping' && (
                                            <div className="flex items-center justify-center gap-2 py-3">
                                                <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                                                <span className="text-xs text-white/50">Executing swap...</span>
                                            </div>
                                        )}

                                        {/* Success */}
                                        {tradeState.status === 'success' && tradeState.txHash && (
                                            <div className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-lg space-y-2">
                                                <p className="text-emerald-300 text-xs font-medium">Swap successful!</p>
                                                <p className="text-[10px] text-white/40 font-mono break-all">
                                                    {tradeState.txHash}
                                                </p>
                                                <a
                                                    href={`https://stellar.expert/explorer/testnet/tx/${tradeState.txHash}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-block text-[11px] text-blue-400/80 hover:text-blue-400 underline"
                                                >
                                                    View on Stellar Expert
                                                </a>
                                                <button
                                                    onClick={() => { resetTradeState(); setSwapAmount(''); }}
                                                    className="w-full mt-1 px-3 py-2 bg-white/5 text-white/60 rounded-lg text-xs hover:bg-white/10 transition-all"
                                                    style={{ pointerEvents: 'auto', WebkitAppRegion: 'no-drag' } as any}
                                                    type="button"
                                                >
                                                    New Swap
                                                </button>
                                            </div>
                                        )}

                                        {/* Error */}
                                        {tradeState.status === 'error' && (
                                            <div className="p-3 bg-red-500/5 border border-red-500/10 rounded-lg">
                                                <p className="text-red-300 text-xs">{tradeState.error}</p>
                                                <button
                                                    onClick={resetTradeState}
                                                    className="mt-2 text-[11px] text-white/40 hover:text-white/60 underline"
                                                    style={{ pointerEvents: 'auto', WebkitAppRegion: 'no-drag' } as any}
                                                    type="button"
                                                >
                                                    Try again
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Proof attachment status */}
                                    {privateMode && proofState.status === 'loading' && (
                                        <div className="flex items-center justify-center gap-2 py-2">
                                            <div className="w-3.5 h-3.5 border-2 border-purple-400/20 border-t-purple-400/60 rounded-full animate-spin" />
                                            <span className="text-[11px] text-purple-300/60">Timestamping your strategy on-chain...</span>
                                        </div>
                                    )}

                                    {privateMode && proofState.status === 'success' && proofState.proofHashHex && (
                                        <div className="p-3 bg-purple-500/[0.06] border border-purple-500/10 rounded-xl space-y-2">
                                            <div className="flex items-center gap-1.5">
                                                <svg className="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                                <span className="text-xs text-purple-300 font-medium">Strategy stamped on-chain</span>
                                                {proofState.proofId !== null && proofState.proofId !== undefined && (
                                                    <span className="text-[10px] text-white/30 ml-1">#{proofState.proofId}</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-mono text-white/40 truncate">
                                                    Stamp ID: 0x{proofState.proofHashHex.slice(0, 12)}...{proofState.proofHashHex.slice(-8)}
                                                </span>
                                                <button
                                                    onClick={async () => {
                                                        await navigator.clipboard.writeText(proofState.proofHashHex!);
                                                        setProofsCopied(true);
                                                        setTimeout(() => setProofsCopied(false), 2000);
                                                    }}
                                                    className="text-[10px] text-purple-400/60 hover:text-purple-400 transition-colors"
                                                    style={{ pointerEvents: 'auto', WebkitAppRegion: 'no-drag' } as any}
                                                    type="button"
                                                >
                                                    {proofsCopied ? 'Copied!' : 'Copy'}
                                                </button>
                                            </div>
                                            <p className="text-[9px] text-purple-300/40">You can reveal your strategy later to prove your plan.</p>
                                        </div>
                                    )}

                                    {privateMode && proofState.status === 'error' && (
                                        <div className="p-3 bg-red-500/5 border border-red-500/10 rounded-lg">
                                            <p className="text-red-300 text-[11px]">Stamping failed: {proofState.error}</p>
                                            <button
                                                onClick={resetProofState}
                                                className="mt-1 text-[10px] text-white/40 hover:text-white/60 underline"
                                                style={{ pointerEvents: 'auto', WebkitAppRegion: 'no-drag' } as any}
                                                type="button"
                                            >
                                                Dismiss
                                            </button>
                                        </div>
                                    )}

                                    {/* Proof history (collapsible) */}
                                    {privateMode && (
                                        <div className="border border-white/[0.04] rounded-xl overflow-hidden">
                                            <button
                                                onClick={() => setShowProofHistory(!showProofHistory)}
                                                className="w-full flex items-center justify-between p-3 hover:bg-white/[0.02] transition-colors"
                                                style={{ pointerEvents: 'auto', WebkitAppRegion: 'no-drag' } as any}
                                                type="button"
                                            >
                                                <span className="text-[11px] font-medium text-white/40">Your Strategy Stamps</span>
                                                <svg
                                                    className={`w-3 h-3 text-white/30 transition-transform ${showProofHistory ? 'rotate-180' : ''}`}
                                                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                                >
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </button>
                                            {showProofHistory && (
                                                <div className="px-3 pb-3 space-y-1.5">
                                                    {(() => {
                                                        try {
                                                            const bundles = JSON.parse(localStorage.getItem('haloai_proof_bundles') || '{}');
                                                            const ids = Object.keys(bundles).map(Number).sort((a, b) => b - a).slice(0, 5);
                                                            if (ids.length === 0) return <p className="text-[10px] text-white/20 py-2">No stamps yet</p>;
                                                            return ids.map(id => {
                                                                const isRevealed = revealedProofIds.has(id) || (proofState.status === 'success' && proofState.proofId === id);
                                                                const isExpanded = expandedStampId === id;
                                                                const bundle = bundles[id];
                                                                return (
                                                                <div key={id} className="bg-white/[0.02] rounded-lg overflow-hidden">
                                                                    <button
                                                                        onClick={() => setExpandedStampId(isExpanded ? null : id)}
                                                                        className="w-full flex items-center justify-between p-2 hover:bg-white/[0.02] transition-colors"
                                                                        style={{ pointerEvents: 'auto', WebkitAppRegion: 'no-drag' } as any}
                                                                        type="button"
                                                                    >
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-[10px] text-white/40">Stamp #{id}</span>
                                                                            <span className="text-[10px] font-mono text-white/30">
                                                                                0x{bundle.proofHashHex?.slice(0, 8)}...
                                                                            </span>
                                                                        </div>
                                                                        {isRevealed ? (
                                                                            <span className="text-[10px] text-emerald-400/60">Revealed on-chain</span>
                                                                        ) : (
                                                                            <span className="text-[10px] text-purple-400/40">Tap to view</span>
                                                                        )}
                                                                    </button>
                                                                    {isExpanded && (
                                                                        <div className="px-2 pb-2 space-y-1.5">
                                                                            <div className="p-2 bg-white/[0.02] rounded-md">
                                                                                <p className="text-[9px] text-white/30 mb-0.5">Your reason</p>
                                                                                <p className="text-[11px] text-white/70">{bundle.strategy || '(no strategy noted)'}</p>
                                                                            </div>
                                                                            <div className="p-2 bg-white/[0.02] rounded-md">
                                                                                <p className="text-[9px] text-white/30 mb-0.5">Trade</p>
                                                                                <p className="text-[11px] text-white/50 font-mono">{bundle.tradeParams || '—'}</p>
                                                                            </div>
                                                                            {!isRevealed && (
                                                                                <button
                                                                                    onClick={() => revealTradeProof(id)}
                                                                                    disabled={proofState.status === 'loading'}
                                                                                    className="w-full mt-1 px-3 py-1.5 bg-purple-500/10 text-purple-300/80 rounded-md text-[10px] font-medium hover:bg-purple-500/20 transition-all disabled:opacity-30"
                                                                                    style={{ pointerEvents: 'auto', WebkitAppRegion: 'no-drag' } as any}
                                                                                    type="button"
                                                                                >
                                                                                    {proofState.status === 'loading' ? 'Revealing...' : 'Reveal Strategy On-Chain'}
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                );
                                                            });
                                                        } catch {
                                                            return <p className="text-[10px] text-white/20 py-2">No stamps yet</p>;
                                                        }
                                                    })()}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Sign Out */}
                                    <div className="flex justify-center pt-1 pb-1">
                                        <button
                                            onClick={logout}
                                            className="force-clickable text-xs text-white/20 hover:text-white/50 transition-colors"
                                            style={{ pointerEvents: 'auto', cursor: 'pointer', WebkitAppRegion: 'no-drag' } as any}
                                            type="button"
                                        >
                                            Sign Out
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* Vault tab */}
                    {ready && authenticated && address && activeTab === 'vault' && (
                        <div className="space-y-4">
                            {/* Vault balance card */}
                            <div className="p-4 bg-white/[0.03] rounded-xl border border-white/[0.06]">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <span className="text-xs text-white/40 font-light block mb-1">Vault Balance</span>
                                        <span className="text-2xl text-white/95 font-semibold tracking-tight">
                                            {vaultLoading ? '...' : vaultBalance ? parseFloat(vaultBalance).toFixed(7) : '0.0000000'}
                                        </span>
                                        <span className="text-sm text-white/40 ml-1.5">XLM</span>
                                    </div>
                                    <button
                                        onClick={refreshVaultBalance}
                                        disabled={vaultLoading}
                                        className="text-white/30 hover:text-white/70 transition-colors p-1.5 rounded-md hover:bg-white/5"
                                        title="Refresh vault balance"
                                        type="button"
                                        style={{ pointerEvents: 'auto', WebkitAppRegion: 'no-drag' } as any}
                                    >
                                        <svg className={`w-3.5 h-3.5 ${vaultLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            {/* Deposit / Withdraw */}
                            <div className="p-4 bg-white/[0.03] rounded-xl border border-white/[0.06] space-y-3">
                                <label className="block text-xs font-medium text-white/60">Deposit / Withdraw XLM</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    placeholder="Amount XLM"
                                    value={vaultAmount}
                                    onChange={e => {
                                        setVaultAmount(e.target.value);
                                        if (vaultState.status !== 'idle') resetVaultState();
                                    }}
                                    className="w-full bg-white/5 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/90 placeholder:text-white/20 outline-none focus:border-white/20 transition-colors"
                                    style={{ pointerEvents: 'auto', WebkitAppRegion: 'no-drag' } as any}
                                />
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            if (vaultAmount && parseFloat(vaultAmount) > 0) depositToVault(vaultAmount);
                                        }}
                                        disabled={!vaultAmount || parseFloat(vaultAmount) <= 0 || vaultState.status === 'loading'}
                                        className="flex-1 px-3 py-2.5 bg-emerald-500/20 text-emerald-200 rounded-lg text-xs font-medium hover:bg-emerald-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                        style={{ pointerEvents: 'auto', WebkitAppRegion: 'no-drag' } as any}
                                        type="button"
                                    >
                                        Deposit
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (vaultAmount && parseFloat(vaultAmount) > 0) withdrawFromVault(vaultAmount);
                                        }}
                                        disabled={!vaultAmount || parseFloat(vaultAmount) <= 0 || vaultState.status === 'loading'}
                                        className="flex-1 px-3 py-2.5 bg-orange-500/20 text-orange-200 rounded-lg text-xs font-medium hover:bg-orange-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                        style={{ pointerEvents: 'auto', WebkitAppRegion: 'no-drag' } as any}
                                        type="button"
                                    >
                                        Withdraw
                                    </button>
                                </div>
                            </div>

                            {/* Lock funds */}
                            <div className="p-4 bg-white/[0.03] rounded-xl border border-white/[0.06] space-y-3">
                                <label className="block text-xs font-medium text-white/60">Lock Funds (Escrow)</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    placeholder="Amount XLM to lock"
                                    value={lockAmount}
                                    onChange={e => {
                                        setLockAmount(e.target.value);
                                        if (vaultState.status !== 'idle') resetVaultState();
                                    }}
                                    className="w-full bg-white/5 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/90 placeholder:text-white/20 outline-none focus:border-white/20 transition-colors"
                                    style={{ pointerEvents: 'auto', WebkitAppRegion: 'no-drag' } as any}
                                />
                                <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    placeholder="Lock duration in minutes (e.g. 10)"
                                    value={lockExpiry}
                                    onChange={e => {
                                        setLockExpiry(e.target.value);
                                        if (vaultState.status !== 'idle') resetVaultState();
                                    }}
                                    className="w-full bg-white/5 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/90 placeholder:text-white/20 outline-none focus:border-white/20 transition-colors"
                                    style={{ pointerEvents: 'auto', WebkitAppRegion: 'no-drag' } as any}
                                />
                                <button
                                    onClick={() => {
                                        if (lockAmount && lockExpiry && parseFloat(lockAmount) > 0 && parseInt(lockExpiry) > 0) {
                                            lockInVault(lockAmount, parseInt(lockExpiry));
                                        }
                                    }}
                                    disabled={!lockAmount || !lockExpiry || parseFloat(lockAmount) <= 0 || parseInt(lockExpiry) <= 0 || vaultState.status === 'loading'}
                                    className="w-full px-3 py-2.5 bg-purple-500/20 text-purple-200 rounded-lg text-xs font-medium hover:bg-purple-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                    style={{ pointerEvents: 'auto', WebkitAppRegion: 'no-drag' } as any}
                                    type="button"
                                >
                                    Lock Funds
                                </button>
                            </div>

                            {/* Loading */}
                            {vaultState.status === 'loading' && (
                                <div className="flex items-center justify-center gap-2 py-3">
                                    <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                                    <span className="text-xs text-white/50">Processing...</span>
                                </div>
                            )}

                            {/* Success */}
                            {vaultState.status === 'success' && (
                                <div className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-lg space-y-2">
                                    <p className="text-emerald-300 text-xs font-medium">
                                        {vaultState.lockId !== undefined ? `Locked! Lock ID: ${vaultState.lockId}` : 'Transaction successful!'}
                                    </p>
                                    <button
                                        onClick={() => { resetVaultState(); setVaultAmount(''); setLockAmount(''); setLockExpiry(''); }}
                                        className="w-full mt-1 px-3 py-2 bg-white/5 text-white/60 rounded-lg text-xs hover:bg-white/10 transition-all"
                                        style={{ pointerEvents: 'auto', WebkitAppRegion: 'no-drag' } as any}
                                        type="button"
                                    >
                                        Done
                                    </button>
                                </div>
                            )}

                            {/* Error */}
                            {vaultState.status === 'error' && (
                                <div className="p-3 bg-red-500/5 border border-red-500/10 rounded-lg">
                                    <p className="text-red-300 text-xs">{vaultState.error}</p>
                                    <button
                                        onClick={resetVaultState}
                                        className="mt-2 text-[11px] text-white/40 hover:text-white/60 underline"
                                        style={{ pointerEvents: 'auto', WebkitAppRegion: 'no-drag' } as any}
                                        type="button"
                                    >
                                        Try again
                                    </button>
                                </div>
                            )}

                            {/* Sign Out */}
                            <div className="flex justify-center pt-1 pb-1">
                                <button
                                    onClick={logout}
                                    className="force-clickable text-xs text-white/20 hover:text-white/50 transition-colors"
                                    style={{ pointerEvents: 'auto', cursor: 'pointer', WebkitAppRegion: 'no-drag' } as any}
                                    type="button"
                                >
                                    Sign Out
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}