import ReactMarkdown from 'react-markdown';
import { useState } from 'react';

import { TransactionCard } from './TransactionCard';
import type { TransactionData } from './TransactionCard';
import { PortfolioCard } from './PortfolioCard';
import type { PortfolioData } from './PortfolioCard';
import { TransactionHistory } from './TransactionHistory';
import type { HistoryData } from './TransactionHistory';

interface MessageBubbleProps {
    content: string | TransactionData | PortfolioData | HistoryData;
    role: 'user' | 'assistant';
    isStreaming?: boolean;
}

function CodeBlock({ children, className }: { children: React.ReactNode; className?: string }) {
    const [copied, setCopied] = useState(false);
    
    const codeString = String(children).replace(/\n$/, '');
    
    const handleCopy = () => {
        navigator.clipboard.writeText(codeString);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    
    return (
        <div className="relative group my-3">
            <pre className="bg-slate-950/80 rounded-lg p-4 overflow-x-auto border border-slate-700/50 pr-12">
                <code className={`text-xs text-cyan-100 ${className}`}>
                    {children}
                </code>
            </pre>
            <button
                onClick={handleCopy}
                className="absolute top-2 right-2 p-2 bg-slate-700/50 hover:bg-slate-600/50 rounded-md transition-all opacity-0 group-hover:opacity-100"
                title="Copy code"
            >
                {copied ? (
                    <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                ) : (
                    <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                )}
            </button>
        </div>
    );
}

export function MessageBubble({ content, role, isStreaming = false }: MessageBubbleProps) {
    const isUser = role === 'user';

    return (
        <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-slide-up`}>
            <div
                className={`max-w-[85%] rounded-2xl px-5 py-4 ${
                    isUser
                        ? 'bg-gradient-to-br from-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/20'
                        : 'bg-gradient-to-br from-slate-800/90 to-slate-900/90 text-slate-100 backdrop-blur-sm border border-slate-700/50 shadow-xl'
                }`}
            >

                {/* User Message */}
                {isUser && typeof content === 'string' && (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
                )}

                {/* Assistant: Transaction Card */}
                {!isUser && typeof content !== 'string' && 'type' in content && content.type === 'transaction' && (
                    <TransactionCard data={content as TransactionData} />
                )}

                {/* Assistant: Portfolio Card */}
                {!isUser && typeof content !== 'string' && 'type' in content && content.type === 'portfolio' && (
                    <PortfolioCard data={content as PortfolioData} />
                )}

                {/* Assistant: History Card */}
                {!isUser && typeof content !== 'string' && 'type' in content && content.type === 'history' && (
                    <TransactionHistory data={content as HistoryData} />
                )}

                {/* Assistant: Text Response */}
                {!isUser && typeof content === 'string' && (
                    <div className="prose prose-invert prose-sm max-w-none markdown-content max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                        <ReactMarkdown
                            components={{
                                // Paragraphs
                                p: ({ children }) => (
                                    <p className="mb-3 last:mb-0 leading-relaxed text-slate-100">
                                        {children}
                                    </p>
                                ),
                                // Headings
                                h1: ({ children }) => (
                                    <h1 className="text-lg font-bold mb-3 text-cyan-300">{children}</h1>
                                ),
                                h2: ({ children }) => (
                                    <h2 className="text-base font-semibold mb-2 text-cyan-300">{children}</h2>
                                ),
                                h3: ({ children }) => (
                                    <h3 className="text-sm font-semibold mb-2 text-cyan-400">{children}</h3>
                                ),
                                // Bold
                                strong: ({ children }) => (
                                    <strong className="font-semibold text-cyan-200">{children}</strong>
                                ),
                                // Italic
                                em: ({ children }) => (
                                    <em className="italic text-slate-300">{children}</em>
                                ),
                                // Lists
                                ul: ({ children }) => (
                                    <ul className="list-disc list-inside space-y-1.5 mb-3 text-slate-200 pl-2">
                                        {children}
                                    </ul>
                                ),
                                ol: ({ children }) => (
                                    <ol className="list-decimal list-inside space-y-1.5 mb-3 text-slate-200 pl-2">
                                        {children}
                                    </ol>
                                ),
                                li: ({ children }) => (
                                    <li className="leading-relaxed">{children}</li>
                                ),
                                // Code blocks and inline code
                                code: ({ children, className }) => {
                                    const isBlock = className?.includes('language-');
                                    return isBlock ? (
                                        <CodeBlock className={className}>{children}</CodeBlock>
                                    ) : (
                                        <code className="px-1.5 py-0.5 bg-slate-700/50 rounded text-cyan-300 text-xs font-mono">
                                            {children}
                                        </code>
                                    );
                                },
                                // Blockquotes
                                blockquote: ({ children }) => (
                                    <blockquote className="border-l-4 border-cyan-500 pl-4 py-2 my-3 bg-slate-800/50 rounded-r italic text-slate-300">
                                        {children}
                                    </blockquote>
                                ),
                                // Links
                                a: ({ href, children }) => (
                                    <a
                                        href={href}
                                        className="text-cyan-400 hover:text-cyan-300 underline decoration-cyan-500/50 hover:decoration-cyan-400 transition-colors"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        {children}
                                    </a>
                                ),
                                // Horizontal rule
                                hr: () => <hr className="my-4 border-slate-700" />,
                            }}
                        >
                            {content}
                        </ReactMarkdown>
                        {isStreaming && (
                            <span className="inline-block w-2 h-4 bg-cyan-400 ml-1 animate-pulse rounded-sm" />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
