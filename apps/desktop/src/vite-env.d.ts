/// <reference types="vite/client" />

interface Window {
    electronAPI: {
        hideWindow: () => Promise<void>;
        expandWindow: () => Promise<void>;
        captureScreenshot: () => Promise<string | null>;
        getAuthToken: () => Promise<string | null>;
        setAuthToken: (token: string) => Promise<boolean>;
        getKeybinding: () => Promise<string>;
        setKeybinding: (keybinding: string) => Promise<boolean>;
        resetKeybinding: () => Promise<string>;
        onWindowShown: (callback: (isCapturing: boolean) => void) => void;
        onAuthTokenReceived: (callback: (token: string) => void) => void;
        onAutoScreenshotCaptured: (callback: (dataUrl: string) => void) => void;
        removeAllListeners: (channel: string) => void;
    };
}
