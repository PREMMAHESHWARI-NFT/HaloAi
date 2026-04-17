import { useState } from 'react';

export interface PortfolioData {
    type: 'portfolio';
    address: string;
    network: 'Testnet' | 'Mainnet';
    balances: {
        asset_type: string;
        asset_code?: string;
        balance: string;
    }[];
}

export function PortfolioCard({ data }: { data: PortfolioData }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(data.address);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const xlmBalance = data.balances.find(b => b.asset_type === 'native')?.balance || '0';
    const otherAssets = data.balances.filter(b => b.asset_type !== 'native');

    return (
        <div className="w-full max-w-sm rounded-xl overflow-hidden bg-[#1A1A1A] border border-white/10 shadow-xl my-2 animate-scale-in">
            {/* Header */}
            <div className="px-4 py-3 flex items-center justify-between border-b border-white/5 bg-white/5">
                <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm font-medium text-white/90">Your Portfolio</span>
                </div>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/20">
                    {data.network}
                </span>
            </div>

            {/* Main Balance (XLM) */}
            <div className="p-6 text-center border-b border-white/5">
                <p className="text-xs text-white/40 font-medium uppercase tracking-wider mb-1">Total Balance</p>
                <div className="flex items-baseline justify-center gap-1">
                    <span className="text-3xl font-bold text-white tracking-tight">{parseFloat(xlmBalance).toFixed(7)}</span>
                    <span className="text-sm text-cyan-400 font-medium">XLM</span>
                </div>
                <p className="text-[10px] text-white/30 mt-2">
                    Reserve: {((2 + data.balances.length - 1) * 0.5).toFixed(1)} XLM required
                </p>
            </div>

            {/* Address */}
            <div className="px-4 py-3 bg-white/[0.02]">
                 <div className="flex justify-between items-center bg-black/20 rounded-lg p-2 border border-white/5">
                    <span className="font-mono text-xs text-white/60 truncate max-w-[200px]">
                        {data.address}
                    </span>
                    <button 
                        onClick={handleCopy}
                        className="p-1.5 hover:bg-white/10 rounded-md transition-colors text-white/40 hover:text-white"
                        title="Copy Address"
                    >
                        {copied ? (
                            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        ) : (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                        )}
                    </button>
                </div>
            </div>

            {/* Other Assets List */}
            {otherAssets.length > 0 && (
                <div className="p-4 space-y-3">
                    <p className="text-xs text-white/40 font-medium uppercase tracking-wider">Other Assets</p>
                    <div className="space-y-2">
                        {otherAssets.map((asset, i) => (
                            <div key={i} className="flex justify-between items-center bg-white/5 rounded-lg p-2.5 border border-white/5">
                                <span className="text-sm font-medium text-white/80">
                                    {asset.asset_code || 'Unknown'}
                                </span>
                                <span className="text-sm font-mono text-white/60">
                                    {parseFloat(asset.balance).toFixed(4)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
