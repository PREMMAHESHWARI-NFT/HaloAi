
import { useState, useEffect, useRef } from 'react';
import { useAI, useVoiceInput, useVision, useAuth, useWallet } from './hooks';
import SettingsModal from './components/SettingsModal';
import WalletPanel from './components/WalletPanel';
import { MessageBubble } from './components/MessageBubble';

import { getHorizonAccount, getTransactions } from './services/walletApi';
import { detectDevMode, extractContextSnippets, formatSnippets } from './services/devMode';
import type { TransactionData } from './components/TransactionCard';
import type { PortfolioData } from './components/PortfolioCard';
import type { HistoryData } from './components/TransactionHistory';

interface Message {
    role: 'user' | 'assistant';
    content: string | TransactionData | PortfolioData | HistoryData;
}

export default function App() {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [screenshotEnabled, setScreenshotEnabled] = useState(false);
    const [fileEnabled, setFileEnabled] = useState(false);
    const [screenshot, setScreenshot] = useState<string | null>(null);
    const [isCapturing, setIsCapturing] = useState(false); // Track capture state
    const [visionContext, setVisionContext] = useState<string | null>(null);
    const [visionEverUsed, setVisionEverUsed] = useState(false);
    const [streamingContent, setStreamingContent] = useState('');
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isWalletOpen, setIsWalletOpen] = useState(false);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const trustlineEnablingRef = useRef(false);

    const [devMode, setDevMode] = useState(false);
    const [devModeIdeName, setDevModeIdeName] = useState<string | null>(null);
    const [devModeManualOff, setDevModeManualOff] = useState(false);

    const [pendingTransaction, setPendingTransaction] = useState<{
        to: string;
        amount: string;
        asset: string;
    } | null>(null);

    const [pendingTrade, setPendingTrade] = useState<{
        amount: string;
        fromAsset: string;
        toAsset: string;
        slippage: string;
        mode: string;
        quote?: string;
    } | null>(null);

    const [pendingVault, setPendingVault] = useState<{
        action: 'deposit' | 'withdraw' | 'lock';
        amount: string;
        lockLedgers?: string;
    } | null>(null);

    const { chat, isLoading } = useAI();
    const { authenticated } = useAuth();
    const {
        address, balance, send, sendState, resetSendState,
        // Trade
        tradeState, hasTrustline, trustlineLoading,
        checkUsdcTrustline, enableTrustline, fetchQuote, swap, resetTradeState,
        // Vault
        vaultState, depositToVault, withdrawFromVault, lockInVault, resetVaultState,
    } = useWallet();
    const { analyzeScreenshot, isAnalyzing } = useVision();
    const { isRecording, transcript, toggleRecording } = useVoiceInput({
        onTranscript: (text, isFinal) => {
            if (isFinal) {
                setInput((prev) => prev + text + ' ');
            }
        },
    });

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, streamingContent]);

    useEffect(() => {
        const handleWindowShown = (_event: any, capturing: boolean) => {
             console.log('[HaloAI] Window shown event received. Capturing:', capturing);
             inputRef.current?.focus();
             setMessages([]);
             setInput('');
             setScreenshot(null);
             
             if (capturing) {
                 setIsCapturing(true);
                 setTimeout(() => setIsCapturing(false), 2000);
             } else {
                 setIsCapturing(false);
             }
        };

        // Method 1: Context Bridge
        if (window.electronAPI) {
            window.electronAPI.onWindowShown((capturing) => handleWindowShown(null, capturing));
        } 
        // Method 2: Direct IPC
        else if (window.require) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.on('window-shown', handleWindowShown);
        }

        return () => {
            if (window.electronAPI) window.electronAPI.removeAllListeners('window-shown');
            else if (window.require) {
                const { ipcRenderer } = window.require('electron');
                ipcRenderer.removeListener('window-shown', handleWindowShown);
            }
        };
    }, []);

    // Listen for auto-captured screenshot when app is invoked
    useEffect(() => {
        const handleScreenshot = async (_event: any, dataUrl: string) => {
            console.log('[HaloAI] Auto-screenshot received! Analyzing with OpenRouter vision...');
            setIsCapturing(false);
            setScreenshot(dataUrl);
            setScreenshotEnabled(true);
            setVisionEverUsed(true);
            
            const visionDescription = await analyzeScreenshot(dataUrl);
            setVisionContext(visionDescription);
            console.log('[HaloAI] Vision analysis complete!', visionDescription ? 'Context acquired' : 'No context');

            // Dev Mode auto-detection
            if (!devModeManualOff && visionDescription) {
                const detection = detectDevMode(visionDescription, visionDescription);
                setDevMode(detection.enabled);
                setDevModeIdeName(detection.ideName || null);
                if (detection.enabled) console.log('[HaloAI] Dev Mode activated:', detection.ideName, detection.confidence);
            }
        };

        if (window.electronAPI) {
            window.electronAPI.onAutoScreenshotCaptured((dataUrl) => handleScreenshot(null, dataUrl));
        } else if (window.require) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.on('auto-screenshot-captured', handleScreenshot);
        }

        return () => {
             if (window.electronAPI) window.electronAPI.removeAllListeners('auto-screenshot-captured');
             else if (window.require) {
                 const { ipcRenderer } = window.require('electron');
                 ipcRenderer.removeListener('auto-screenshot-captured', handleScreenshot);
             }
        };
    }, [analyzeScreenshot]);

    // Update input with transcript
    useEffect(() => {
        if (transcript && !isRecording) {
            setInput((prev) => prev + transcript);
        }
    }, [transcript, isRecording]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === ',') {
                e.preventDefault();
                setIsSettingsOpen(true);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const handleSubmit = async () => {
        if (!input.trim() && !screenshot) return;

        // Debug logging for re-analysis trigger
        console.log('[HaloAI] Submit state:', {
            visionEverUsed,
            screenshotEnabled,
            hasVisionContext: !!visionContext,
            isAnalyzing,
            hasInput: !!input.trim(),
            hasScreenshot: !!screenshot
        });

        // If vision was ever used, automatically re-analyze before processing
        if (visionEverUsed && !visionContext && !isAnalyzing) {
            console.log('[HaloAI] Auto-reanalyzing screen before processing message...');
            try {
                const dataUrl = await window.electronAPI?.captureScreenshot();
                console.log('[HaloAI] Screenshot captured:', !!dataUrl);
                if (dataUrl) {
                    setScreenshot(dataUrl);
                    const visionDescription = await analyzeScreenshot(dataUrl);
                    setVisionContext(visionDescription);
                    console.log('[HaloAI] Auto-reanalysis complete!');
                }
            } catch (error) {
                console.error('[HaloAI] Auto-reanalysis failed:', error);
            }
        } else {
            console.log('[HaloAI] Skipping auto re-analysis - condition not met');
        }

        const currentVisionContext = visionContext;
        const currentScreenshot = screenshot;
        const userContent = input.trim() || (currentScreenshot ? 'Help me with what is currently on my screen.' : '');
        const userMessage: Message = { role: 'user', content: userContent };

        setMessages((prev) => [...prev, userMessage]);
        setInput('');
        setScreenshot(null);
        setVisionContext(null);
        setStreamingContent('');

        window.electronAPI?.expandWindow();

        try {
            const allMessages = [...messages, userMessage].map((m) => {
                if (typeof m.content === 'string') {
                    return { role: m.role as 'user' | 'assistant', content: m.content };
                }
                const textParts = (m.content as unknown as { type: string; text?: string }[])
                    .filter(c => c.type === 'text' && c.text)
                    .map(c => c.text!)
                    .join('\n');
                return { role: m.role as 'user' | 'assistant', content: textParts || '' };
            });

            // Inject dev mode context snippets if active
            let enrichedVisionContext = currentVisionContext || undefined;
            if (devMode && currentVisionContext) {
                const snippets = extractContextSnippets(currentVisionContext);
                const snippetStr = formatSnippets(snippets);
                if (snippetStr) {
                    enrichedVisionContext = `${currentVisionContext}\n\n── Dev Context Snippets ──\n${snippetStr}`;
                }
            }

            const response = await chat(
                allMessages,
                (chunk) => {
                    setStreamingContent((prev) => prev + chunk);
                },
                enrichedVisionContext,
                devMode
            );

            // Check for transfer intent
            const cleanResponse = response.trim();


            // Try detecting JSON inside code block
            const jsonMatch = cleanResponse.match(/```json\s*([\s\S]*?)\s*```/);
            
            // Try detecting raw JSON (starting with { or "json {")
            const rawJsonMatch = cleanResponse.match(/^(?:json\s*)?(\{[\s\S]*\})/i);

            try {
                let parsedDetails = null;
                if (jsonMatch) {
                    parsedDetails = JSON.parse(jsonMatch[1]);
                } else if (rawJsonMatch) {
                    parsedDetails = JSON.parse(rawJsonMatch[1]);
                }

                if (parsedDetails) {
                    // Handle Transfer
                    if (parsedDetails.type === 'transfer') {
                        // 1. Validate Address
                        if (!/^G[A-Z0-9]{55}$/.test(parsedDetails.to)) {
                             setMessages((prev) => [
                                 ...prev,
                                 { role: 'assistant', content: "❌ Invalid Stellar address detected. Please check the destination address." }
                             ]);
                             setStreamingContent('');
                             return;
                        }

                        // 2. Validate Balance
                        const currentBalance = parseFloat(balance || '0');
                        const transferAmount = parseFloat(parsedDetails.amount);
                        const reserve = 1.5; // Base reserve + safe margin

                        if (currentBalance < transferAmount + reserve) {
                             setMessages((prev) => [
                                 ...prev,
                                 { role: 'assistant', content: `❌ Insufficient balance. You have ${currentBalance} XLM, but need to cover the transfer (${transferAmount} XLM) plus reserve.` }
                             ]);
                             setStreamingContent('');
                             return;
                        }

                        setPendingTransaction(parsedDetails);
                        setMessages((prev) => [
                            ...prev,
                            { role: 'assistant', content: 'Please confirm the transaction details.' }
                        ]);
                        setStreamingContent('');
                        return;
                    }
                    
                    // Handle Balance/Portfolio
                    if (parsedDetails.type === 'balance') {
                         if (!address) {
                             setMessages((prev) => [
                                 ...prev,
                                 { role: 'assistant', content: "Please connect your wallet first to view your portfolio." }
                             ]);
                             setStreamingContent('');
                             return;
                         }

                         try {
                             const accountData = await getHorizonAccount(address);
                             const portfolioMessage: PortfolioData = {
                                 type: 'portfolio',
                                 address: address,
                                 network: 'Testnet',
                                 balances: accountData.balances
                             };
                             
                             setMessages((prev) => [
                                 ...prev,
                                 { role: 'assistant', content: portfolioMessage }
                             ]);
                         } catch (err) {
                             console.error('Failed to fetch portfolio', err);
                             setMessages((prev) => [
                                 ...prev,
                                 { role: 'assistant', content: "❌ Failed to fetch your portfolio data. Please try again." }
                             ]);
                         }
                         setStreamingContent('');
                         return;
                    }

                    // Handle History
                    if (parsedDetails.type === 'history') {
                         if (!address) {
                             setMessages((prev) => [
                                 ...prev,
                                 { role: 'assistant', content: "Please connect your wallet first to view your history." }
                             ]);
                             setStreamingContent('');
                             return;
                         }

                         try {
                             // Force fresh fetch
                             const txs = await getTransactions(address); // Using address (as userId in our mock)
                             const historyMessage: HistoryData = {
                                 type: 'history',
                                 transactions: txs
                             };
                             
                             setMessages((prev) => [
                                 ...prev,
                                 { role: 'assistant', content: historyMessage }
                             ]);
                         } catch (err) {
                             console.error('Failed to fetch history', err);
                             setMessages((prev) => [
                                 ...prev,
                                 { role: 'assistant', content: "❌ Failed to fetch your history. Please try again." }
                             ]);
                         }
                         setStreamingContent('');
                         return;
                    }

                    // Handle Trade/Swap (TradeDraft schema)
                    if (parsedDetails.type === 'swap') {
                        if (!address) {
                            setMessages(prev => [...prev, { role: 'assistant', content: 'Please connect your wallet first to trade.' }]);
                            setStreamingContent('');
                            return;
                        }

                        const tradeAmount = parseFloat(parsedDetails.amount);
                        const currentBalance = parseFloat(balance || '0');
                        const reserve = 1.5;

                        if (currentBalance < tradeAmount + reserve) {
                            setMessages(prev => [...prev, {
                                role: 'assistant',
                                content: `Insufficient balance. You have ${currentBalance} XLM but need ${tradeAmount} XLM plus reserve.`
                            }]);
                            setStreamingContent('');
                            return;
                        }

                        // Check trustline and fetch quote
                        await checkUsdcTrustline();
                        setPendingTrade({
                            amount: parsedDetails.amount,
                            fromAsset: parsedDetails.fromAsset || 'XLM',
                            toAsset: parsedDetails.toAsset || 'USDC',
                            slippage: parsedDetails.slippage || '1',
                            mode: parsedDetails.mode || 'market',
                        });
                        setMessages(prev => [...prev, { role: 'assistant', content: 'Fetching swap quote...' }]);
                        await fetchQuote(parsedDetails.amount);
                        setStreamingContent('');
                        return;
                    }

                    // Handle Vault Deposit
                    if (parsedDetails.type === 'vault_deposit') {
                        if (!address) {
                            setMessages(prev => [...prev, { role: 'assistant', content: 'Please connect your wallet first.' }]);
                            setStreamingContent('');
                            return;
                        }
                        const depositAmount = parseFloat(parsedDetails.amount);
                        const currentBalance = parseFloat(balance || '0');
                        if (currentBalance < depositAmount + 1.5) {
                            setMessages(prev => [...prev, {
                                role: 'assistant',
                                content: `Insufficient balance for deposit. You have ${currentBalance} XLM.`
                            }]);
                            setStreamingContent('');
                            return;
                        }
                        setPendingVault({ action: 'deposit', amount: parsedDetails.amount });
                        setMessages(prev => [...prev, { role: 'assistant', content: 'Please confirm the vault deposit.' }]);
                        setStreamingContent('');
                        return;
                    }

                    // Handle Vault Withdraw
                    if (parsedDetails.type === 'vault_withdraw') {
                        if (!address) {
                            setMessages(prev => [...prev, { role: 'assistant', content: 'Please connect your wallet first.' }]);
                            setStreamingContent('');
                            return;
                        }
                        setPendingVault({ action: 'withdraw', amount: parsedDetails.amount });
                        setMessages(prev => [...prev, { role: 'assistant', content: 'Please confirm the vault withdrawal.' }]);
                        setStreamingContent('');
                        return;
                    }

                    // Handle Vault Lock
                    if (parsedDetails.type === 'vault_lock') {
                        if (!address) {
                            setMessages(prev => [...prev, { role: 'assistant', content: 'Please connect your wallet first.' }]);
                            setStreamingContent('');
                            return;
                        }
                        setPendingVault({
                            action: 'lock',
                            amount: parsedDetails.amount,
                            lockLedgers: parsedDetails.lockLedgers,
                        });
                        setMessages(prev => [...prev, { role: 'assistant', content: 'Please confirm the vault lock.' }]);
                        setStreamingContent('');
                        return;
                    }
                }
            } catch (e) {
                console.error('Failed to parse AI JSON', e);
            }

            setMessages((prev) => [
                ...prev,
                { role: 'assistant', content: response },
            ]);
            setStreamingContent('');
        } catch (err) {
            setMessages((prev) => [
                ...prev,
                {
                    role: 'assistant',
                    content: '❌ Sorry, I encountered an error. Please try again.',
                },
            ]);
            setStreamingContent('');
        }
    };

    const handleConfirmTransaction = async () => {
        if (!pendingTransaction) return;
        
        try {
            await send(pendingTransaction.to, pendingTransaction.amount);
            // Don't null pendingTransaction here yet, we need it for the success effect
        } catch (e) {
            console.error(e);
        }
    };

    // Effect to handle sendState success
    // Effect to handle sendState success
    useEffect(() => {
        if (sendState.status === 'success' && sendState.txHash && pendingTransaction) {
            setMessages(prev => [
                ...prev, 
                { 
                    role: 'assistant', 
                    content: {
                        type: 'transaction',
                        status: 'success',
                        amount: pendingTransaction.amount,
                        asset: 'XLM',
                        to: pendingTransaction.to,
                        txHash: sendState.txHash!,
                        network: 'Testnet'
                    }
                }
            ]);
            setPendingTransaction(null);
            resetSendState();
        } else if (sendState.status === 'error') {
            setMessages(prev => [
                ...prev, 
                { 
                    role: 'assistant', 
                    content: {
                        type: 'transaction',
                        status: 'failed',
                        amount: pendingTransaction?.amount || '0',
                        asset: 'XLM',
                        to: pendingTransaction?.to || 'Unknown',
                        txHash: '',
                        network: 'Testnet',
                        error: sendState.error
                    }
                }
            ]);
            setPendingTransaction(null);
            resetSendState();
        }
    }, [sendState, resetSendState]);

    // Effect: when trade quote arrives, update pendingTrade with quote
    // Depends on primitives (status, quote string) to avoid object-reference rerenders
    useEffect(() => {
        if (tradeState.status === 'quoted' && tradeState.quote && pendingTrade && !pendingTrade.quote) {
            setPendingTrade(prev => prev ? { ...prev, quote: tradeState.quote } : null);
        }
    }, [tradeState.status, tradeState.quote, pendingTrade]);

    // Effect: handle trustline requirement for trade (ref guard prevents re-fire)
    useEffect(() => {
        if (pendingTrade && hasTrustline === false && !trustlineLoading && !trustlineEnablingRef.current) {
            trustlineEnablingRef.current = true;
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: 'USDC trustline is required for this trade. Enabling it now...'
            }]);
            enableTrustline();
        }
        if (hasTrustline === true) {
            trustlineEnablingRef.current = false;
        }
    }, [hasTrustline, pendingTrade, trustlineLoading, enableTrustline]);

    // Effect: trade result
    useEffect(() => {
        if (tradeState.status === 'success' && tradeState.txHash && pendingTrade) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `Swap successful! Swapped ${pendingTrade.amount} ${pendingTrade.fromAsset} for ~${pendingTrade.quote || '?'} ${pendingTrade.toAsset}.\n\n[View on Stellar Expert](https://stellar.expert/explorer/testnet/tx/${tradeState.txHash})`
            }]);
            setPendingTrade(null);
            resetTradeState();
        } else if (tradeState.status === 'error' && pendingTrade) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `Trade failed: ${tradeState.error || 'Unknown error'}`
            }]);
            setPendingTrade(null);
            resetTradeState();
        }
    }, [tradeState, pendingTrade, resetTradeState]);

    // Effect: vault result
    useEffect(() => {
        if (vaultState.status === 'success' && pendingVault) {
            const actionLabel = pendingVault.action === 'deposit' ? 'Deposited' :
                               pendingVault.action === 'withdraw' ? 'Withdrew' : 'Locked';
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `Vault ${pendingVault.action} successful! ${actionLabel} ${pendingVault.amount} XLM.${vaultState.lockId ? ` Lock ID: ${vaultState.lockId}` : ''}${vaultState.txHash && vaultState.txHash !== 'ok' ? `\n\n[View on Stellar Expert](https://stellar.expert/explorer/testnet/tx/${vaultState.txHash})` : ''}`
            }]);
            setPendingVault(null);
            resetVaultState();
        } else if (vaultState.status === 'error' && pendingVault) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `Vault ${pendingVault.action} failed: ${vaultState.error || 'Unknown error'}`
            }]);
            setPendingVault(null);
            resetVaultState();
        }
    }, [vaultState, pendingVault, resetVaultState]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
        if (e.key === 'Escape') {
            window.electronAPI?.hideWindow();
        }
    };

    const handleReanalyzeScreen = async () => {
        try {
            console.log('[HaloAI] Re-analyzing screen...');
            setIsCapturing(true);
            
            let dataUrl: string | null = null;

            // Method 1: Try Context Bridge (Standard)
            if (window.electronAPI?.captureScreenshot) {
                dataUrl = await window.electronAPI.captureScreenshot();
            } 
            // Method 2: Direct IPC (Demo/Dev Mode)
            else if (window.require) {
                console.log('[HaloAI] Using direct IPC fallback');
                const { ipcRenderer } = window.require('electron');
                dataUrl = await ipcRenderer.invoke('capture-screenshot');
            } else {
                console.error('[HaloAI] No Electron access available');
                return;
            }
            
            if (dataUrl) {
                console.log('[HaloAI] Screenshot captured successfully, length:', dataUrl.length);
                setScreenshot(dataUrl);
                setScreenshotEnabled(true);
                setVisionEverUsed(true);
                
                console.log('[HaloAI] Starting vision analysis...');
                const visionDescription = await analyzeScreenshot(dataUrl);
                setVisionContext(visionDescription);
                console.log('[HaloAI] Re-analysis complete!');

                // Dev Mode auto-detection
                if (!devModeManualOff && visionDescription) {
                    const detection = detectDevMode(visionDescription, visionDescription);
                    setDevMode(detection.enabled);
                    setDevModeIdeName(detection.ideName || null);
                }
            } else {
                console.warn('[HaloAI] Capture returned null - no screenshot available');
            }
        } catch (error) {
            console.error('[HaloAI] Re-analysis failed:', error);
        } finally {
            setIsCapturing(false);
        }
    };

    return (
        // Changed main background to transparent, removed slate gradients
        // Added border-white/10 and rounded-2xl to the outer container for the requested border
        <div className="h-full w-full flex animate-fade-in bg-transparent p-1">
            {/* Synapse-style UI */}
            <div className="h-full w-full flex glass rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                {/* Main Content Area */}
                <div className="flex-1 flex flex-col h-full">
                    {/* Header */}
                    <div className="drag-region flex items-center justify-between px-6 py-4">
                        <div className="flex items-center gap-3">
                            {/* Changed pulse to neutral/white */}
                            <div className="w-2 h-2 rounded-full bg-white/40 animate-pulse" />
                            <span className="text-white/80 font-medium text-sm tracking-wide">HaloAI</span>
                        </div>
                        <div className="no-drag flex items-center gap-3">
                            <button
                                onClick={() => setIsWalletOpen(true)}
                                className="text-white/40 hover:text-white/80 transition-colors p-1.5 rounded-md hover:bg-white/5 flex items-center gap-1.5"
                                title="Wallet"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
                                </svg>
                                {authenticated && address ? (
                                    <span className="text-[10px] font-mono text-white/50">{address.slice(0, 4)}...{address.slice(-4)}</span>
                                ) : (
                                    <span className="text-[10px] text-white/50">Wallet</span>
                                )}
                            </button>
                            <button
                                onClick={() => setIsSettingsOpen(true)}
                                className="text-white/40 hover:text-white/80 transition-colors p-1.5 rounded-md hover:bg-white/5"
                                title="Settings (Ctrl+,)"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                            </button>
                            <button
                                onClick={() => window.electronAPI?.hideWindow()}
                                className="text-white/40 hover:text-white/80 transition-colors text-xs px-2 py-1 rounded-md hover:bg-white/5"
                            >
                                ESC
                            </button>
                        </div>
                    </div>

                    {/* Dev Mode Banner */}
                    {devMode && (
                        <div className="mx-6 mb-2 flex items-center justify-between px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/15 animate-fade-in">
                            <div className="flex items-center gap-2">
                                <svg className="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
                                </svg>
                                <span className="text-xs text-amber-300/90 font-medium">
                                    Dev Mode{devModeIdeName ? `: ${devModeIdeName} detected` : ''}
                                </span>
                            </div>
                            <button
                                onClick={() => { setDevMode(false); setDevModeManualOff(true); }}
                                className="text-[10px] text-white/40 hover:text-white/70 px-2 py-0.5 rounded hover:bg-white/5 transition-colors"
                            >
                                Disable
                            </button>
                        </div>
                    )}

                    {/* Messages Area or Greeting */}
                    <div className="flex-1 overflow-y-auto px-6">
                        {messages.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center pb-32">
                                <h1 className="text-3xl font-light text-white/90 mb-2 tracking-tight">Good Evening</h1>
                                <p className="text-white/40 text-sm font-light mb-8">How can I help you?</p>
                                
                                {!screenshot && !isAnalyzing && (
                                    <button 
                                        onClick={handleReanalyzeScreen}
                                        disabled={isCapturing}
                                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all border border-white/5 hover:border-white/10 group"
                                    >
                                        {isCapturing ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin"/>
                                                <span>Capturing...</span>
                                            </>
                                        ) : (
                                            <>
                                                <svg className="w-4 h-4 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                                </svg>
                                                <span>Capture Screen</span>
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="py-6 space-y-6 max-w-3xl mx-auto">
                                {messages.map((msg, i) => (
                                    <MessageBubble key={i} content={msg.content} role={msg.role} />
                                ))}

                                {isLoading && streamingContent && (
                                    <MessageBubble
                                        content={streamingContent}
                                        role="assistant"
                                        isStreaming={true}
                                    />
                                )}

                                {isLoading && !streamingContent && (
                                    <div className="flex justify-start">
                                        <div className="bg-white/5 rounded-xl px-4 py-3 backdrop-blur-sm">
                                            <div className="flex gap-1.5">
                                                {/* Changed bounce colors to white/neutral */}
                                                <span className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                                <span className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                                <span className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>
                        )}
                    </div>

                    {/* Input Area */}
                    <div className="p-6 mt-auto">
                        {/* Vision Status & Re-analyze */}
                        {isAnalyzing && (
                            // Changed cyan to white/neutral
                            <div className="mb-3 text-xs text-white/80 flex items-center gap-2 bg-white/5 px-3 py-2 rounded-lg border border-white/10 max-w-3xl mx-auto">
                                <div className="animate-spin w-3 h-3 border border-white/60 border-t-transparent rounded-full" />
                                <span>Analyzing screenshot...</span>
                            </div>
                        )}

                        {visionContext && !isAnalyzing && (
                            <div className="mb-3 flex items-center justify-between max-w-3xl mx-auto">
                                <div className="text-xs text-emerald-400/90 flex items-center gap-2 bg-emerald-500/10 px-3 py-2 rounded-lg border border-emerald-500/10">
                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
                                        <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/>
                                    </svg>
                                    <span>Screen analyzed</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {devModeManualOff && !devMode && (
                                        <button
                                            onClick={() => { setDevModeManualOff(false); const d = detectDevMode(visionContext || '', visionContext || ''); setDevMode(d.enabled); setDevModeIdeName(d.ideName || null); }}
                                            className="text-[10px] text-amber-400/50 hover:text-amber-400 px-2 py-1 hover:bg-amber-500/5 rounded transition-colors"
                                        >
                                            Re-enable Dev Mode
                                        </button>
                                    )}
                                    <button
                                        onClick={handleReanalyzeScreen}
                                        className="text-xs text-white/60 hover:text-white flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-white/5 rounded-md transition-colors"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                        Re-analyze
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Input Box with Inline Icons */}
                        <div className="max-w-3xl mx-auto">
                            {/* Further refined transparency: bg-black/40 instead of white/5 for contrast on transparent bg */}
                            <div className="relative flex items-center gap-2 bg-[#1A1A1A]/80 border border-white/10 rounded-xl px-4 py-3 backdrop-blur-xl transition-all shadow-lg hover:border-white/20 focus-within:border-white/30 focus-within:ring-1 focus-within:ring-white/10">
                                <textarea
                                    ref={inputRef}
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder={
                                        isRecording ? 'Listening...' : 
                                        screenshot ? 'Ask about this screen...' :
                                        'Ask anything...'
                                    }
                                    className="flex-1 bg-transparent border-none text-white placeholder-white/30 focus:outline-none resize-none text-sm font-light tracking-wide"
                                    rows={1}
                                    disabled={isLoading}
                                    style={{ minHeight: '24px', maxHeight: '120px' }}
                                />

                                {/* Inline Action Icons */}
                                <div className="flex items-center gap-1">
                                    {/* Screenshot Icon */}
                                    <button
                                        onClick={handleReanalyzeScreen}
                                        disabled={isCapturing}
                                        className={`p-1.5 rounded-md transition-colors ${
                                            screenshotEnabled || visionContext || isCapturing
                                                // Neutral active state
                                                ? 'text-white bg-white/20'
                                                : 'text-white/30 hover:text-white/60 hover:bg-white/5'
                                        }`}
                                        title="Capture & analyze screen"
                                    >
                                        {isCapturing ? (
                                            <div className="w-4 h-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                            </svg>
                                        )}
                                    </button>

                                    {/* File Icon */}
                                    <button
                                        onClick={() => setFileEnabled(!fileEnabled)}
                                        className={`p-1.5 rounded-md transition-colors ${
                                            fileEnabled
                                                ? 'text-white bg-white/20'
                                                : 'text-white/30 hover:text-white/60 hover:bg-white/5'
                                        }`}
                                        title="Attach file"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                        </svg>
                                    </button>

                                    {/* Voice Icon */}
                                    <button
                                        onClick={toggleRecording}
                                        className={`p-1.5 rounded-md transition-colors ${
                                            isRecording
                                                ? 'text-white bg-red-500/40 animate-pulse'
                                                : 'text-white/30 hover:text-white/60 hover:bg-white/5'
                                        }`}
                                        title="Voice input"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                        </svg>
                                    </button>

                                    {/* Submit Button */}
                                    <button
                                        onClick={handleSubmit}
                                        disabled={(!input.trim() && !screenshot) || isLoading}
                                        // Changed gradient to subtle neutral/white button
                                        className="p-1.5 bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed rounded-md text-white transition-all ml-1"
                                    >
                                        {isLoading ? (
                                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                            </svg>
                                        ) : (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Keyboard Hints */}
                            <p className="text-white/20 text-[10px] mt-3 text-center tracking-wider uppercase font-medium">
                                Press <span className="text-white/40">Enter</span> to send · <span className="text-white/40">Esc</span> to hide
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Settings Modal */}
            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
            />

            {/* Wallet Panel */}
            <WalletPanel
                isOpen={isWalletOpen}
                onClose={() => setIsWalletOpen(false)}
            />

            {/* Transaction Confirmation Modal */}
            {pendingTransaction && (
                <div className="fixed inset-0 z-[1000000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-[#1A1A1A] border border-white/10 rounded-xl p-6 w-[400px] shadow-2xl animate-scale-in">
                        <h3 className="text-lg font-medium text-white mb-4">Confirm Transaction</h3>
                        
                        <div className="space-y-4 mb-6">
                            <div className="bg-white/5 rounded-lg p-3">
                                <label className="text-xs text-white/40 block mb-1">To</label>
                                <p className="text-sm font-mono text-white/90 break-all">{pendingTransaction.to}</p>
                            </div>
                            
                            <div className="flex gap-4">
                                <div className="bg-white/5 rounded-lg p-3 flex-1">
                                    <label className="text-xs text-white/40 block mb-1">Amount</label>
                                    <p className="text-lg font-medium text-white">{pendingTransaction.amount} XLM</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button 
                                onClick={() => setPendingTransaction(null)}
                                className="flex-1 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors text-sm"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleConfirmTransaction}
                                disabled={sendState.status === 'loading'}
                                className="flex-1 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white font-medium transition-colors text-sm flex items-center justify-center gap-2"
                            >
                                {sendState.status === 'loading' ? (
                                    <>
                                        <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                        <span>Sending...</span>
                                    </>
                                ) : (
                                    'Confirm Send'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Trade Confirmation Modal */}
            {pendingTrade && pendingTrade.quote && (
                <div className="fixed inset-0 z-[1000000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-[#1A1A1A] border border-white/10 rounded-xl p-6 w-[400px] shadow-2xl animate-scale-in">
                        <h3 className="text-lg font-medium text-white mb-4">Confirm Swap</h3>
                        <div className="space-y-4 mb-6">
                            <div className="bg-white/5 rounded-lg p-3">
                                <label className="text-xs text-white/40 block mb-1">You Send</label>
                                <p className="text-lg font-medium text-white">{pendingTrade.amount} {pendingTrade.fromAsset}</p>
                            </div>
                            <div className="bg-white/5 rounded-lg p-3">
                                <label className="text-xs text-white/40 block mb-1">You Receive (estimated)</label>
                                <p className="text-lg font-medium text-emerald-400">{parseFloat(pendingTrade.quote).toFixed(4)} {pendingTrade.toAsset}</p>
                            </div>
                            <div className="flex gap-3">
                                <div className="bg-white/5 rounded-lg p-3 flex-1">
                                    <label className="text-xs text-white/40 block mb-1">Slippage Tolerance</label>
                                    <p className="text-sm text-white/90">{pendingTrade.slippage}%</p>
                                </div>
                                <div className="bg-white/5 rounded-lg p-3 flex-1">
                                    <label className="text-xs text-white/40 block mb-1">Mode</label>
                                    <p className="text-sm text-white/90 capitalize">{pendingTrade.mode}</p>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => { setPendingTrade(null); resetTradeState(); }}
                                className="flex-1 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => swap(pendingTrade.amount, pendingTrade.quote!)}
                                disabled={tradeState.status === 'swapping'}
                                className="flex-1 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white font-medium transition-colors text-sm flex items-center justify-center gap-2"
                            >
                                {tradeState.status === 'swapping' ? (
                                    <>
                                        <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                        <span>Swapping...</span>
                                    </>
                                ) : 'Confirm Swap'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Vault Confirmation Modal */}
            {pendingVault && (
                <div className="fixed inset-0 z-[1000000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-[#1A1A1A] border border-white/10 rounded-xl p-6 w-[400px] shadow-2xl animate-scale-in">
                        <h3 className="text-lg font-medium text-white mb-4">
                            Confirm Vault {pendingVault.action.charAt(0).toUpperCase() + pendingVault.action.slice(1)}
                        </h3>
                        <div className="space-y-4 mb-6">
                            <div className="bg-white/5 rounded-lg p-3">
                                <label className="text-xs text-white/40 block mb-1">Amount</label>
                                <p className="text-lg font-medium text-white">{pendingVault.amount} XLM</p>
                            </div>
                            {pendingVault.action === 'lock' && pendingVault.lockLedgers && (
                                <div className="bg-white/5 rounded-lg p-3">
                                    <label className="text-xs text-white/40 block mb-1">Lock Duration</label>
                                    <p className="text-sm text-white/90">{pendingVault.lockLedgers} ledgers (~{Math.round(parseInt(pendingVault.lockLedgers) * 5 / 60)} minutes)</p>
                                </div>
                            )}
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => { setPendingVault(null); resetVaultState(); }}
                                className="flex-1 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    if (pendingVault.action === 'deposit') depositToVault(pendingVault.amount);
                                    else if (pendingVault.action === 'withdraw') withdrawFromVault(pendingVault.amount);
                                    else if (pendingVault.action === 'lock') lockInVault(pendingVault.amount, parseInt(pendingVault.lockLedgers || '1000'));
                                }}
                                disabled={vaultState.status === 'loading'}
                                className="flex-1 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white font-medium transition-colors text-sm flex items-center justify-center gap-2"
                            >
                                {vaultState.status === 'loading' ? (
                                    <>
                                        <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                        <span>Processing...</span>
                                    </>
                                ) : `Confirm ${pendingVault.action.charAt(0).toUpperCase() + pendingVault.action.slice(1)}`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
