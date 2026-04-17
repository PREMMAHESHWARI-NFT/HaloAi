import React from 'react';
import ReactDOM from 'react-dom/client';
import { PrivyProvider } from '@privy-io/react-auth';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

// Global error handler - catches all uncaught errors
window.onerror = (message, source, lineno, colno, error) => {
    console.error('🔴 Global Error Handler:', {
        message,
        source,
        lineno,
        colno,
        error,
    });

    // Return false to allow default error handling
    return false;
};

// Global unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
    console.error('🔴 Unhandled Promise Rejection:', {
        reason: event.reason,
        promise: event.promise,
    });

    // Prevent default to avoid "Unhandled promise rejection" warnings in console
    // event.preventDefault();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <ErrorBoundary>
            <PrivyProvider
                appId={import.meta.env.VITE_PRIVY_APP_ID}
                config={{
                    appearance: { theme: 'dark', accentColor: '#FFFFFF' },
                    loginMethods: ['email', 'google'],
                    embeddedWallets: {
                        createOnLogin: 'users-without-wallets',
                    },
                }}
            >
                <App />
            </PrivyProvider>
        </ErrorBoundary>
    </React.StrictMode>
);
