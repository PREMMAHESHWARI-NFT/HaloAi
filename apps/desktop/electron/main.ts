import { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu, nativeImage, desktopCapturer, screen } from 'electron';
import path from 'path';
import fs from 'fs';

// Simple JSON file store (replaces electron-store to avoid pnpm/Electron compatibility issues)
class SimpleStore {
    private data: Record<string, unknown>;
    private filePath: string;

    constructor(opts: { defaults?: Record<string, unknown> } = {}) {
        this.filePath = path.join(app.getPath('userData'), 'config.json');
        try {
            this.data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
        } catch {
            this.data = {};
        }
        if (opts.defaults) {
            for (const [key, value] of Object.entries(opts.defaults)) {
                if (!(key in this.data)) {
                    this.data[key] = value;
                }
            }
        }
    }

    get(key: string, defaultValue?: unknown): unknown {
        return key in this.data ? this.data[key] : defaultValue;
    }

    set(key: string, value: unknown): void {
        this.data[key] = value;
        fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
    }
}

// Platform-aware default shortcut
// macOS: Option+Space conflicts with input source switching, use Cmd+Shift+Space
// Windows/Linux: Alt+Space
const DEFAULT_KEYBINDING = process.platform === 'darwin' ? 'Command+Shift+Space' : 'Ctrl+Space';

// Store is initialized lazily after app is ready
let store: SimpleStore;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isVisible = false;

// Double-tap detection
// let lastAltPress = 0;
// Double-tap detection
// let lastAltPress = 0;
// const DOUBLE_TAP_THRESHOLD = 400;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 600,
        height: 400,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: true,
        show: false,
        webPreferences: {
            sandbox: false,
            nodeIntegration: true, // Enable for demo/prototype
            contextIsolation: false, // Disable for demo/prototype
            webSecurity: false, // Optional: useful for loading local resources in demo
            // preload: path.join(__dirname, 'preload.cjs'), // Not strictly needed with nodeIntegration but keeping it doesn't hurt
        },
    });

    // Debug: Log preload path
    const preloadPath = path.join(__dirname, 'preload.cjs');
    console.log('[Main] Preload path:', preloadPath);
    console.log('[Main] __dirname:', __dirname);

    // Load the app
    if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173');
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
        console.log(`[Renderer] ${message}`);
    });

    // Hide instead of close
    mainWindow.on('close', (e) => {
        e.preventDefault();
        hideWindow();
    });

    mainWindow.on('blur', () => {
        // Auto-hide when focus is lost (optional behavior)
        // hideWindow();
    });
}

async function showWindow() {
    if (!mainWindow) return;

    try {
        // Center on screen and show window FIRST (don't block on screenshot)
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width, height } = primaryDisplay.workAreaSize;

        mainWindow.setSize(600, 400);
        mainWindow.setPosition(
            Math.round((width - 600) / 2),
            Math.round((height - 400) / 3)
        );

        mainWindow.show();
        mainWindow.focus();
        isVisible = true;

        console.log('[Main] Window shown and focused');

        // Capture screenshot AFTER showing window (asynchronously, don't block)
        let screenshotDataUrl: string | null = null;

        try {
            const sources = await desktopCapturer.getSources({
                types: ['screen'],
                thumbnailSize: { width: 1280, height: 720 },
            });

            if (sources.length > 0) {
                const dataUrl = sources[0].thumbnail.toDataURL();

                if (dataUrl && dataUrl.startsWith('data:image')) {
                    console.log('[Screenshot] Captured successfully, size:', dataUrl.length);
                    screenshotDataUrl = dataUrl;
                } else {
                    console.warn('[Screenshot] Invalid screenshot data, skipping');
                }
            } else {
                console.warn('[Screenshot] No screen sources found');
            }
        } catch (error) {
            console.error('[Screenshot] Auto-screenshot error:', error);
            // Continue anyway - app works without vision
        }

        // Signal window shown (resets UI)
        mainWindow.webContents.send('window-shown', !!screenshotDataUrl);

        // Send the screenshot if available
        if (screenshotDataUrl) {
            console.log('[Screenshot] Sending captured screenshot to renderer');
            mainWindow.webContents.send('auto-screenshot-captured', screenshotDataUrl);
        }
    } catch (error) {
        console.error('[Main] showWindow error:', error);
        // Still try to show the window even if there's an error
        mainWindow.show();
        mainWindow.focus();
        isVisible = true;
    }
}

function hideWindow() {
    if (mainWindow) {
        mainWindow.hide();
        isVisible = false;
    }
}

function expandWindow() {
    if (mainWindow) {
        // const { screen } = require('electron');
        // const primaryDisplay = screen.getPrimaryDisplay();
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width, height } = primaryDisplay.workAreaSize;

        const newWidth = Math.min(1000, width - 100);
        const newHeight = Math.min(700, height - 100);

        mainWindow.setSize(newWidth, newHeight);
        mainWindow.setPosition(
            Math.round((width - newWidth) / 2),
            Math.round((height - newHeight) / 2)
        );
    }
}

function createTray() {
    // Create a simple tray icon (16x16 purple square)
    const icon = nativeImage.createEmpty();
    tray = new Tray(icon);

    const contextMenu = Menu.buildFromTemplate([
        { label: 'Show HaloAI', click: showWindow },
        { type: 'separator' },
        {
            label: 'Quit', click: () => {
                mainWindow?.destroy();
                app.quit();
            }
        },
    ]);

    tray.setToolTip(process.platform === 'darwin' ? 'HaloAI - Cmd+Shift+Space to activate' : 'HaloAI - Ctrl+Space to activate');
    tray.setContextMenu(contextMenu);

    tray.on('click', showWindow);
}

function registerHotkeys() {
    // Migrate old Alt+Space default (conflicts with Windows system menu)
    const storedBinding = store.get('keybinding') as string;
    if (storedBinding === 'Alt+Space' && process.platform !== 'darwin') {
        store.set('keybinding', DEFAULT_KEYBINDING);
    }

    // Register the custom keybinding from store
    const keybinding = store.get('keybinding', DEFAULT_KEYBINDING) as string;

    try {
        const success = globalShortcut.register(keybinding, () => {
            if (isVisible) {
                hideWindow();
            } else {
                showWindow();
            }
        });

        if (!success) {
            console.error(`Failed to register global shortcut: ${keybinding}`);
        } else {
            console.log(`Registered global shortcut: ${keybinding}`);
        }
    } catch (error) {
        console.error(`Error registering global shortcut: ${keybinding}`, error);
    }

    // Escape to hide (keep this always registered)
    globalShortcut.register('Escape', () => {
        if (isVisible) {
            hideWindow();
        }
    });
}

function updateKeybinding(newKeybinding: string): boolean {
    // Get the old keybinding
    const oldKeybinding = store.get('keybinding', DEFAULT_KEYBINDING) as string;

    // Unregister the old one
    if (oldKeybinding) {
        globalShortcut.unregister(oldKeybinding);
    }

    // Register the new one
    try {
        const success = globalShortcut.register(newKeybinding, () => {
            if (isVisible) {
                hideWindow();
            } else {
                showWindow();
            }
        });

        if (success) {
            // Save to store only if registration was successful
            store.set('keybinding', newKeybinding);
            console.log(`Updated keybinding to: ${newKeybinding}`);
            return true;
        } else {
            // If registration failed, re-register the old one
            globalShortcut.register(oldKeybinding, () => {
                if (isVisible) {
                    hideWindow();
                } else {
                    showWindow();
                }
            });
            console.error(`Failed to register new keybinding: ${newKeybinding}`);
            return false;
        }
    } catch (error) {
        console.error(`Error updating keybinding: ${newKeybinding}`, error);
        // Re-register the old one
        globalShortcut.register(oldKeybinding, () => {
            if (isVisible) {
                hideWindow();
            } else {
                showWindow();
            }
        });
        return false;
    }
}

// IPC Handlers
function setupIPC() {
    ipcMain.handle('hide-window', () => {
        hideWindow();
    });

    ipcMain.handle('expand-window', () => {
        expandWindow();
    });

    ipcMain.handle('capture-screenshot', async () => {
        const startTime = Date.now();
        console.log('[Screenshot] ========== Starting capture ==========');

        // Save initial window state
        const wasVisible = isVisible;
        const maxRetries = 3;
        let lastError: Error | null = null;

        try {
            // CRITICAL: Hide window before capture to avoid capturing the HaloAI window itself
            // This significantly improves capture reliability on Windows 11
            if (mainWindow && wasVisible) {
                console.log('[Screenshot] Hiding window for clean capture...');
                mainWindow.hide();
                isVisible = false; // Update state immediately

                // Increased delay to 500ms for Windows 11 reliability (especially with multiple GPUs)
                // This gives the OS compositor enough time to fully hide the window
                await new Promise(resolve => setTimeout(resolve, 500));
                console.log('[Screenshot] Window hidden, proceeding with capture');
            }

            // Retry loop for improved reliability
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    console.log(`[Screenshot] Attempt ${attempt}/${maxRetries}`);
                    const attemptStart = Date.now();

                    // Request screen sources from OS
                    const sourcesPromise = desktopCapturer.getSources({
                        types: ['screen'],
                        thumbnailSize: { width: 1280, height: 720 },
                    });

                    // 5 second timeout per attempt (increased from 4s)
                    const timeoutPromise = new Promise<Electron.DesktopCapturerSource[]>((_, reject) => {
                        setTimeout(() => reject(new Error(`Timeout after 5000ms on attempt ${attempt}`)), 5000);
                    });

                    const sources = await Promise.race([sourcesPromise, timeoutPromise]);
                    const attemptDuration = Date.now() - attemptStart;

                    console.log(`[Screenshot] Attempt ${attempt} completed in ${attemptDuration}ms`);

                    if (sources && sources.length > 0) {
                        const result = sources[0].thumbnail.toDataURL();
                        const totalDuration = Date.now() - startTime;

                        console.log(`[Screenshot] ✓ Capture successful! Total time: ${totalDuration}ms`);
                        console.log(`[Screenshot] Data URL length: ${result.length} bytes`);
                        return result;
                    } else {
                        console.warn(`[Screenshot] Attempt ${attempt}: No screen sources found`);
                        lastError = new Error('No screen sources available');

                        // Don't retry if no sources found - it won't help
                        if (attempt < maxRetries) {
                            console.log('[Screenshot] Retrying in 500ms...');
                            await new Promise(resolve => setTimeout(resolve, 500));
                        }
                    }

                } catch (attemptError) {
                    lastError = attemptError instanceof Error ? attemptError : new Error(String(attemptError));
                    console.error(`[Screenshot] Attempt ${attempt} failed:`, lastError.message);

                    // Only retry if we haven't exhausted attempts
                    if (attempt < maxRetries) {
                        console.log(`[Screenshot] Retrying... (${maxRetries - attempt} attempts remaining)`);
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
            }

            // All retries exhausted
            const totalDuration = Date.now() - startTime;
            console.error(`[Screenshot] ✗ All ${maxRetries} attempts failed after ${totalDuration}ms`);
            console.error(`[Screenshot] Last error:`, lastError?.message || 'Unknown error');
            console.error(`[Screenshot] This may be due to Windows GPU configuration. See: https://github.com/electron/electron/issues/16196`);

            return null;

        } catch (error) {
            const totalDuration = Date.now() - startTime;
            console.error(`[Screenshot] ✗ Unexpected error after ${totalDuration}ms:`, error);
            return null;
        } finally {
            // ALWAYS restore window visibility if it was visible before
            if (mainWindow && wasVisible) {
                console.log('[Screenshot] Restoring window visibility...');
                mainWindow.show();
                mainWindow.focus();
                isVisible = true;
                console.log('[Screenshot] Window restored');
            }
            console.log('[Screenshot] ========== Capture complete ==========');
        }
    });

    ipcMain.handle('get-auth-token', () => {
        try {
            // const encryptedToken = safeStorage.encryptString('');
            // For now, return empty - will be set by auth flow
            return null;
        } catch {
            return null;
        }
    });

    ipcMain.handle('set-auth-token', (_event, _token: string) => {
        try {
            // Store token securely
            // In production, use electron-store with safeStorage
            return true;
        } catch {
            return false;
        }
    });

    // Keybinding management
    ipcMain.handle('get-keybinding', () => {
        return store.get('keybinding', DEFAULT_KEYBINDING);
    });

    ipcMain.handle('set-keybinding', (_event, keybinding: string) => {
        return updateKeybinding(keybinding);
    });

    ipcMain.handle('reset-keybinding', () => {
        const success = updateKeybinding(DEFAULT_KEYBINDING);
        return success ? DEFAULT_KEYBINDING : store.get('keybinding');
    });
}

// Deep link handling
app.setAsDefaultProtocolClient('halo');

app.on('open-url', (_event, url) => {
    // Handle halo://auth?token=xxx
    const urlObj = new URL(url);
    if (urlObj.pathname === '//auth' || urlObj.host === 'auth') {
        const token = urlObj.searchParams.get('token');
        if (token && mainWindow) {
            mainWindow.webContents.send('auth-token-received', token);
        }
    }
});

// App lifecycle
app.whenReady().then(() => {
    store = new SimpleStore({
        defaults: { keybinding: DEFAULT_KEYBINDING }
    });
    createWindow();
    showWindow();
    createTray();
    registerHotkeys();
    setupIPC();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        } else {
            showWindow();
        }
    });

    app.on('will-quit', () => {
        globalShortcut.unregisterAll();
    });
});

app.on('window-all-closed', () => {
    // Don't quit the app when window is closed/hidden
    // The app should stay running in the system tray
    // if (process.platform !== 'darwin') {
    //     app.quit();
    // }
});

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        showWindow();
    });
}
