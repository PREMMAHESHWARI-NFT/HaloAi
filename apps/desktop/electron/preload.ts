// @ts-nocheck
const { contextBridge, ipcRenderer } = require('electron');

console.log('[Preload] Script loading...');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Window controls
    hideWindow: () => ipcRenderer.invoke('hide-window'),
    expandWindow: () => ipcRenderer.invoke('expand-window'),

    // Screenshot
    captureScreenshot: () => ipcRenderer.invoke('capture-screenshot'),

    // Auth
    getAuthToken: () => ipcRenderer.invoke('get-auth-token'),
    setAuthToken: (token: string) => ipcRenderer.invoke('set-auth-token', token),

    // Keybinding
    getKeybinding: () => ipcRenderer.invoke('get-keybinding'),
    setKeybinding: (keybinding: string) => ipcRenderer.invoke('set-keybinding', keybinding),
    resetKeybinding: () => ipcRenderer.invoke('reset-keybinding'),

    // Event listeners
    onWindowShown: (callback: (isCapturing: boolean) => void) => {
        ipcRenderer.on('window-shown', (_event, isCapturing) => callback(isCapturing));
    },
    onAuthTokenReceived: (callback: (token: string) => void) => {
        ipcRenderer.on('auth-token-received', (_event, token) => callback(token));
    },
    onAutoScreenshotCaptured: (callback: (dataUrl: string) => void) => {
        ipcRenderer.on('auto-screenshot-captured', (_event, dataUrl) => callback(dataUrl));
    },

    // Cleanup
    removeAllListeners: (channel: string) => {
        ipcRenderer.removeAllListeners(channel);
    },
});

console.log('[Preload] electronAPI exposed successfully');

// Type definitions for renderer
declare global {
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
}

export { };
