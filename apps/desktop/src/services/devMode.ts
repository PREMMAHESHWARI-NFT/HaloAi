/**
 * Dev Mode — IDE detection and context extraction from screen captures.
 *
 * detectDevMode:        Scans vision/OCR text for IDE indicators.
 * extractContextSnippets: Pulls file names, errors, stack traces from OCR text.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DevModeResult {
    enabled: boolean;
    ideName?: string;
    confidence: number;
}

export interface ContextSnippets {
    fileName?: string;
    errors: string[];
    stackTraces: string[];
    imports: string[];
    commands: string[];
}

// ─── IDE Signatures ──────────────────────────────────────────────────────────

interface Signature {
    pattern: string;
    weight: number;
    ide?: string; // If set, this is a primary IDE name
}

const SIGNATURES: Signature[] = [
    // Primary — IDE names (high weight, set ideName)
    { pattern: 'visual studio code', weight: 0.4, ide: 'VS Code' },
    { pattern: 'vscode',             weight: 0.4, ide: 'VS Code' },
    { pattern: 'intellij idea',      weight: 0.4, ide: 'IntelliJ IDEA' },
    { pattern: 'intellij',           weight: 0.35, ide: 'IntelliJ IDEA' },
    { pattern: 'webstorm',           weight: 0.4, ide: 'WebStorm' },
    { pattern: 'pycharm',            weight: 0.4, ide: 'PyCharm' },
    { pattern: 'android studio',     weight: 0.4, ide: 'Android Studio' },
    { pattern: 'sublime text',       weight: 0.4, ide: 'Sublime Text' },
    { pattern: 'neovim',             weight: 0.4, ide: 'Neovim' },
    { pattern: 'vim',                weight: 0.3, ide: 'Vim' },
    { pattern: 'emacs',              weight: 0.4, ide: 'Emacs' },

    // Secondary — IDE panel/tab indicators (medium weight)
    { pattern: 'explorer',       weight: 0.2 },
    { pattern: 'terminal',       weight: 0.2 },
    { pattern: 'problems',       weight: 0.2 },
    { pattern: 'output',         weight: 0.15 },
    { pattern: 'debug console',  weight: 0.2 },
    { pattern: 'source control', weight: 0.2 },
    { pattern: '.tsx',           weight: 0.2 },
    { pattern: '.ts',            weight: 0.2 },
    { pattern: '.py',            weight: 0.2 },
    { pattern: '.rs',            weight: 0.2 },
    { pattern: '.go',            weight: 0.2 },
    { pattern: '.java',          weight: 0.2 },
    { pattern: '.jsx',           weight: 0.2 },
    { pattern: '.vue',           weight: 0.2 },
    { pattern: '.cpp',           weight: 0.2 },

    // Tertiary — dev environment clues (low weight)
    { pattern: 'git',            weight: 0.1 },
    { pattern: 'npm',            weight: 0.1 },
    { pattern: 'error ts',       weight: 0.1 },
    { pattern: 'syntaxerror',    weight: 0.1 },
    { pattern: 'typeerror',      weight: 0.1 },
    { pattern: 'referenceerror', weight: 0.1 },
    { pattern: 'at line',        weight: 0.1 },
    { pattern: 'traceback',      weight: 0.1 },
    { pattern: 'build failed',   weight: 0.1 },
    { pattern: 'build succeeded', weight: 0.1 },
    { pattern: 'localhost:',     weight: 0.1 },
    { pattern: 'compiler',       weight: 0.1 },
];

// ─── Detection ───────────────────────────────────────────────────────────────

export function detectDevMode(visionText: string, ocrText: string): DevModeResult {
    const combined = `${visionText}\n${ocrText}`.toLowerCase();

    let confidence = 0;
    let ideName: string | undefined;

    for (const sig of SIGNATURES) {
        if (combined.includes(sig.pattern)) {
            confidence += sig.weight;
            if (sig.ide && !ideName) {
                ideName = sig.ide;
            }
        }
    }

    confidence = Math.min(confidence, 1.0);

    return {
        enabled: confidence > 0.75,
        ideName,
        confidence,
    };
}

// ─── Context Snippets ────────────────────────────────────────────────────────

const FILE_PATTERN = /\b[\w\-/\\]+\.(tsx?|jsx?|py|rs|go|java|cpp|c|vue|svelte|rb|sh|json|toml|yaml|yml|md)\b/i;
const ERROR_PATTERNS = [/error/i, /ERR!/i, /failed/i, /cannot find/i, /is not defined/i, /no such file/i, /unexpected token/i];
const STACK_PATTERN = /^\s+at\s|Traceback|File\s+"[^"]+"/;
const IMPORT_PATTERN = /^(import\s|from\s.+import|const\s.+=\s*require\()/;
const COMMAND_PATTERN = /^(\$|>|npm\s|npx\s|pnpm\s|yarn\s|cargo\s|python\s|node\s|git\s|stellar\s)/;

export function extractContextSnippets(ocrText: string): ContextSnippets {
    const lines = ocrText.split('\n');

    let fileName: string | undefined;
    const errors: string[] = [];
    const stackTraces: string[] = [];
    const imports: string[] = [];
    const commands: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // File name (first match wins)
        if (!fileName) {
            const fileMatch = trimmed.match(FILE_PATTERN);
            if (fileMatch) fileName = fileMatch[0];
        }

        // Errors
        if (ERROR_PATTERNS.some(p => p.test(trimmed))) {
            errors.push(trimmed);
        }

        // Stack traces
        if (STACK_PATTERN.test(trimmed)) {
            stackTraces.push(trimmed);
        }

        // Imports
        if (IMPORT_PATTERN.test(trimmed)) {
            imports.push(trimmed);
        }

        // Commands
        if (COMMAND_PATTERN.test(trimmed)) {
            commands.push(trimmed);
        }
    }

    return {
        fileName,
        errors: errors.slice(0, 10),
        stackTraces: stackTraces.slice(0, 10),
        imports: imports.slice(0, 10),
        commands: commands.slice(0, 5),
    };
}

/** Format context snippets into a string for injection into system prompts. */
export function formatSnippets(snippets: ContextSnippets): string {
    const parts: string[] = [];
    if (snippets.fileName) parts.push(`File: ${snippets.fileName}`);
    if (snippets.errors.length) parts.push(`Errors:\n${snippets.errors.join('\n')}`);
    if (snippets.stackTraces.length) parts.push(`Stack traces:\n${snippets.stackTraces.join('\n')}`);
    if (snippets.imports.length) parts.push(`Imports:\n${snippets.imports.join('\n')}`);
    if (snippets.commands.length) parts.push(`Commands:\n${snippets.commands.join('\n')}`);
    return parts.join('\n\n');
}
