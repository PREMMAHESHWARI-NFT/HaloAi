// Shim to fix Electron's require('electron') with pnpm
// pnpm's symlinked node_modules causes require('electron') to resolve
// to the npm package (path string) instead of Electron's built-in module.
// This shim removes the npm cache entry and forces re-resolution through
// Electron's Module._resolveFilename hook.
const Module = require('module');

// Get the original resolve to find the npm electron package path
let npmElectronPath;
try {
    npmElectronPath = Module._resolveFilename('electron');
} catch {}

// Delete the npm electron package from the require cache
if (npmElectronPath && require.cache[npmElectronPath]) {
    delete require.cache[npmElectronPath];
}

// Now check: if we're in Electron, process.type should be 'browser' (main process)
// The built-in electron module is available through Electron's internal binding
if (process.versions.electron) {
    // We're running inside Electron - access the built-in module
    // Electron exposes its modules through a special require that's set up
    // during initialization. We need to bypass the npm package.

    // Method: Override Module._resolveFilename temporarily to return 'electron'
    // as a built-in, then require it
    const originalResolveFilename = Module._resolveFilename;
    Module._resolveFilename = function(request, parent, isMain, options) {
        if (request === 'electron') {
            return 'electron';
        }
        return originalResolveFilename.call(this, request, parent, isMain, options);
    };

    // Now try to load - Module._load should handle 'electron' as a built-in
    try {
        module.exports = require('electron');
    } catch {
        // Fallback: try process._linkedBinding
        module.exports = process._linkedBinding ? process._linkedBinding('electron_common') : {};
    }

    // Restore original
    Module._resolveFilename = originalResolveFilename;
} else {
    // Not in Electron runtime, export the npm package (path to binary)
    module.exports = require('electron');
}
