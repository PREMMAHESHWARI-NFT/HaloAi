import { useState, useEffect } from 'react';

interface WalletSendFormProps {
    onSend: (to: string, amount: string) => Promise<void>;
    sendState: {
        status: 'idle' | 'loading' | 'success' | 'error';
        txHash?: string;
        error?: string;
    };
    onReset: () => void;
}

export default function WalletSendForm({ onSend, sendState, onReset }: WalletSendFormProps) {
    const [to, setTo] = useState('');
    const [amount, setAmount] = useState('');

    // Auto-reset form after successful send
    useEffect(() => {
        if (sendState.status === 'success') {
            const timer = setTimeout(() => {
                onReset();
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [sendState.status, onReset]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!to.trim() || !amount.trim()) return;
        await onSend(to.trim(), amount.trim());
        setTo('');
        setAmount('');
    };

    return (
        <div className="space-y-3">
            {/* Success toast */}
            {sendState.status === 'success' && (
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/10 rounded-lg flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <p className="text-emerald-300 text-[11px]">
                        Sent! <span className="text-emerald-300/50 font-mono">{sendState.txHash?.slice(0, 16)}...</span>
                    </p>
                </div>
            )}

            {sendState.status === 'error' && (
                <div className="p-2.5 bg-red-500/10 border border-red-500/10 rounded-lg">
                    <p className="text-red-300 text-xs">{sendState.error}</p>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-2.5">
                <input
                    type="text"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    placeholder="Destination address (G...)"
                    disabled={sendState.status === 'loading'}
                    className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-lg text-white text-xs placeholder-white/20 focus:outline-none focus:border-white/20 transition-colors font-mono"
                />
                <div className="flex gap-2">
                    <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="Amount"
                        step="any"
                        min="0"
                        disabled={sendState.status === 'loading'}
                        className="flex-1 px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-lg text-white text-xs placeholder-white/20 focus:outline-none focus:border-white/20 transition-colors"
                    />
                    <button
                        type="submit"
                        disabled={!to.trim() || !amount.trim() || sendState.status === 'loading'}
                        className={`px-5 py-2 rounded-lg font-medium transition-all text-xs ${
                            !to.trim() || !amount.trim() || sendState.status === 'loading'
                                ? 'bg-white/5 text-white/30 cursor-not-allowed'
                                : 'bg-white text-black hover:bg-white/90'
                        }`}
                        style={{ pointerEvents: 'auto', WebkitAppRegion: 'no-drag' } as any}
                    >
                        {sendState.status === 'loading' ? (
                            <div className="w-3.5 h-3.5 border-2 border-black/20 border-t-black/60 rounded-full animate-spin" />
                        ) : 'Send'}
                    </button>
                </div>
            </form>
        </div>
    );
}
