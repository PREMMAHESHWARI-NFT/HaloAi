import { useState } from 'react';

export interface TransactionData {
    type: 'transaction';
    status: 'success' | 'failed' | 'pending';
    amount: string;
    asset: string;
    to: string;
    txHash: string;
    network: 'Testnet' | 'Mainnet';
    error?: string;
    // Trade-specific
    isTrade?: boolean;
    sourceAsset?: string;
    sourceAmount?: string;
}

interface TransactionCardProps {
    data: TransactionData;
}

export function TransactionCard({ data }: TransactionCardProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(data.to);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const explorerLink = `https://stellar.expert/explorer/testnet/tx/${data.txHash}`;
    const truncatedAddress = `${data.to.slice(0, 6)}...${data.to.slice(-6)}`;

    return (
        <div className="w-full max-w-sm rounded-xl overflow-hidden bg-[#1A1A1A] border border-white/10 shadow-xl my-2 animate-scale-in">
            {/* Header */}
            <div className={`px-4 py-3 flex items-center gap-2 border-b border-white/5 ${
                data.status === 'success' ? 'bg-emerald-500/10' : 
                data.status === 'failed' ? 'bg-red-500/10' : 'bg-blue-500/10'
            }`}>
                {data.status === 'success' ? (
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                        <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                ) : data.status === 'failed' ? (
                    <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center">
                        <svg className="w-3 h-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </div>
                ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-blue-500/30 border-t-blue-500 animate-spin" />
                )}
                <span className={`text-sm font-medium ${
                    data.status === 'success' ? 'text-emerald-400' : 
                    data.status === 'failed' ? 'text-red-400' : 'text-blue-400'
                }`}>
                    {data.status === 'success'
                        ? (data.isTrade ? 'Swap Successful' : 'Transaction Sent')
                        : data.status === 'failed'
                        ? (data.isTrade ? 'Swap Failed' : 'Transaction Failed')
                        : 'Processing...'}
                </span>
            </div>

            {/* Body */}
            <div className="p-4 space-y-4">
                {/* Amount Row(s) */}
                {data.isTrade && data.sourceAmount && data.sourceAsset ? (
                    <>
                        <div className="flex justify-between items-baseline">
                            <span className="text-xs text-white/40 font-medium uppercase tracking-wider">Sold</span>
                            <div className="text-right">
                                <span className="text-lg font-bold text-white tracking-tight">{data.sourceAmount}</span>
                                <span className="text-sm text-white/60 ml-1.5 font-medium">{data.sourceAsset}</span>
                            </div>
                        </div>
                        <div className="flex justify-between items-baseline">
                            <span className="text-xs text-white/40 font-medium uppercase tracking-wider">Bought</span>
                            <div className="text-right">
                                <span className="text-lg font-bold text-emerald-400 tracking-tight">{data.amount}</span>
                                <span className="text-sm text-white/60 ml-1.5 font-medium">{data.asset}</span>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex justify-between items-baseline">
                        <span className="text-xs text-white/40 font-medium uppercase tracking-wider">Amount</span>
                        <div className="text-right">
                            <span className="text-xl font-bold text-white tracking-tight">{data.amount}</span>
                            <span className="text-sm text-white/60 ml-1.5 font-medium">{data.asset}</span>
                        </div>
                    </div>
                )}

                {/* Network Row */}
                <div className="flex justify-between items-baseline">
                    <span className="text-xs text-white/40 font-medium uppercase tracking-wider">Network</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-white/5 text-white/60 font-mono border border-white/5">
                        {data.network}
                    </span>
                </div>

                {/* Separator */}
                <div className="h-px w-full bg-white/5" />

                {/* Recipient Row */}
                <div className="space-y-1.5">
                    <div className="flex justify-between items-baseline">
                        <span className="text-xs text-white/40 font-medium uppercase tracking-wider">To</span>
                        <button 
                            onClick={handleCopy}
                            className="text-[10px] flex items-center gap-1 text-white/30 hover:text-white/60 transition-colors"
                        >
                            {copied ? 'Copied!' : 'Copy Address'}
                            {!copied && (
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                            )}
                        </button>
                    </div>
                    <div className="bg-white/[0.03] rounded-lg p-2.5 border border-white/5 group relative">
                         <p className="font-mono text-xs text-white/80 break-all text-center">
                             {truncatedAddress}
                         </p>
                         {/* Tooltip with full address on hover could go here */}
                    </div>
                </div>

                {data.error && (
                    <div className="bg-red-500/10 border border-red-500/10 rounded-lg p-3">
                        <p className="text-xs text-red-300 leading-relaxed">{data.error}</p>
                    </div>
                )}

                {/* Footer Action */}
                {data.txHash && (
                    <a 
                        href={explorerLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block w-full py-2.5 px-4 bg-white/[0.03] hover:bg-white/[0.08] text-white/60 hover:text-white text-center rounded-lg text-xs font-medium transition-all border border-white/5 hover:border-white/10 flex items-center justify-center gap-2 mt-2"
                    >
                        <span>View on Stellar Explorer</span>
                        <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                    </a>
                )}
            </div>
        </div>
    );
}
