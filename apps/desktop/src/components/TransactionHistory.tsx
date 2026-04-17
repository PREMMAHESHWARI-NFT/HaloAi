import { useState } from 'react';
import type { Transaction } from '../services/walletApi';

export interface HistoryData {
    type: 'history';
    transactions: Transaction[];
}

export function TransactionHistory({ data }: { data: HistoryData }) {
    const { transactions } = data;
    const [page, setPage] = useState(0);
    const ITEMS_PER_PAGE = 5;

    const sortedTransactions = [...transactions]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    const paginatedTransactions = sortedTransactions.slice(
        page * ITEMS_PER_PAGE, 
        (page + 1) * ITEMS_PER_PAGE
    );

    const totalPages = Math.ceil(transactions.length / ITEMS_PER_PAGE);

    if (transactions.length === 0) {
        return (
            <div className="w-full max-w-sm rounded-xl bg-[#1A1A1A] border border-white/10 p-6 text-center shadow-xl animate-scale-in">
                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-5 h-5 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <p className="text-white/60 text-sm">No transactions found.</p>
            </div>
        );
    }

    return (
        <div className="w-full max-w-sm rounded-xl overflow-hidden bg-[#1A1A1A] border border-white/10 shadow-xl my-2 animate-scale-in">
            {/* Header */}
            <div className="px-4 py-3 flex items-center justify-between border-b border-white/5 bg-white/5">
                <span className="text-sm font-medium text-white/90">Transaction History</span>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/10 text-white/60">
                    {transactions.length} Total
                </span>
            </div>

            {/* List */}
            <div className="divide-y divide-white/5">
                {paginatedTransactions.map((tx) => (
                    <div key={tx.id} className="p-4 hover:bg-white/[0.02] transition-colors group relative">
                        <div className="flex justify-between items-start mb-1">
                            <div className="flex items-center gap-2">
                                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                    tx.type === 'trade'
                                        ? 'bg-purple-500/20 text-purple-400'
                                        : tx.type === 'received'
                                        ? 'bg-emerald-500/20 text-emerald-400'
                                        : 'bg-orange-500/20 text-orange-400'
                                }`}>
                                    {tx.type === 'trade' ? 'Trade' : tx.type === 'received' ? 'Received' : 'Sent'}
                                </span>
                                <span className="text-[10px] text-white/40">
                                    {new Date(tx.date).toLocaleDateString()}
                                </span>
                            </div>
                            <a 
                                href={`https://stellar.expert/explorer/testnet/tx/${tx.txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-white/30 hover:text-white"
                                title="View on Explorer"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                            </a>
                        </div>

                        <div className="flex justify-between items-end">
                            {tx.type === 'trade' ? (
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold text-purple-400 leading-tight">
                                        {tx.sourceAmount} {tx.sourceAsset} → {tx.amount} {tx.asset}
                                    </span>
                                </div>
                            ) : (
                                <>
                                    <div className="flex flex-col">
                                        <span className={`text-lg font-bold leading-tight ${
                                            tx.type === 'received' ? 'text-emerald-400' : 'text-white'
                                        }`}>
                                            {tx.type === 'received' ? '+' : '-'}{tx.amount}
                                        </span>
                                        <span className="text-xs text-white/40 font-medium">{tx.asset}</span>
                                    </div>
                                    <div className="text-right max-w-[120px]">
                                        <span className="text-[10px] text-white/30 block mb-0.5">
                                            {tx.type === 'received' ? 'From' : 'To'}
                                        </span>
                                        <p className="text-[10px] font-mono text-white/60 truncate w-full">
                                            {tx.type === 'received' ? tx.from : tx.to}
                                        </p>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Pagination / Footer */}
            {totalPages > 1 && (
                <div className="px-4 py-3 bg-white/5 border-t border-white/5 flex items-center justify-between">
                    <button 
                        onClick={() => setPage(p => Math.max(0, p - 1))}
                        disabled={page === 0}
                        className="p-1 rounded hover:bg-white/10 text-white/60 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <span className="text-xs text-white/40">
                        Page {page + 1} of {totalPages}
                    </span>
                    <button 
                        onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={page === totalPages - 1}
                        className="p-1 rounded hover:bg-white/10 text-white/60 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                </div>
            )}
        </div>
    );
}
