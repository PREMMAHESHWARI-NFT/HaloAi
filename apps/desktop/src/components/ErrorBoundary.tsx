import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
        };
    }

    static getDerivedStateFromError(error: Error): Partial<State> {
        // Update state so the next render will show the fallback UI
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        // Log error details for debugging
        console.error('🔴 ErrorBoundary caught an error:', error);
        console.error('🔴 Error Info:', errorInfo);
        
        this.setState({
            error,
            errorInfo,
        });
    }

    handleReset = () => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null,
        });
        
        // Optionally reload the app
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
                    <div className="max-w-md w-full bg-red-500/10 border border-red-500/20 rounded-xl p-6 backdrop-blur-sm">
                        <div className="flex items-center gap-3 mb-4">
                            <svg 
                                className="w-6 h-6 text-red-400" 
                                fill="none" 
                                stroke="currentColor" 
                                viewBox="0 0 24 24"
                            >
                                <path 
                                    strokeLinecap="round" 
                                    strokeLinejoin="round" 
                                    strokeWidth={2} 
                                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
                                />
                            </svg>
                            <h1 className="text-lg font-semibold text-red-400">
                                Something went wrong
                            </h1>
                        </div>
                        
                        <p className="text-white/70 text-sm mb-4">
                            The app encountered an unexpected error. Don't worry, your data is safe.
                        </p>
                        
                        {this.state.error && (
                            <div className="bg-black/30 rounded-lg p-3 mb-4 border border-white/5">
                                <p className="text-xs font-mono text-red-300/80 break-all">
                                    {this.state.error.toString()}
                                </p>
                            </div>
                        )}
                        
                        <div className="flex gap-3">
                            <button
                                onClick={this.handleReset}
                                className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors text-sm"
                            >
                                Reload App
                            </button>
                            <button
                                onClick={() => window.electronAPI?.hideWindow()}
                                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white/80 rounded-lg font-medium transition-colors text-sm"
                            >
                                Close
                            </button>
                        </div>
                        
                        {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
                            <details className="mt-4">
                                <summary className="text-xs text-white/50 cursor-pointer hover:text-white/70">
                                    Component Stack (Dev Only)
                                </summary>
                                <pre className="mt-2 text-[10px] text-white/40 overflow-auto max-h-40 bg-black/20 p-2 rounded">
                                    {this.state.errorInfo.componentStack}
                                </pre>
                            </details>
                        )}
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
