import { useState, useEffect, useRef } from 'react';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

// Display keybinding with platform-correct labels
function displayKeybinding(binding: string): string {
    if (isMac) {
        return binding
            .replace(/Alt/g, '\u2325 Option')
            .replace(/Command/g, '\u2318 Cmd')
            .replace(/Ctrl/g, '\u2303 Ctrl')
            .replace(/Shift/g, '\u21E7 Shift');
    }
    return binding;
}

const DEFAULT_KEYBINDING = isMac ? 'Command+Shift+Space' : 'Ctrl+Space';

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
    const [currentKeybinding, setCurrentKeybinding] = useState(DEFAULT_KEYBINDING);
    const [newKeybinding, setNewKeybinding] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [error, setError] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const recorderRef = useRef<HTMLDivElement>(null);

    // Load current keybinding when modal opens
    useEffect(() => {
        if (isOpen) {
            loadKeybinding();
            setNewKeybinding('');
            setError('');
            setIsRecording(false);
        }
    }, [isOpen]);

    const loadKeybinding = async () => {
        try {
            const keybinding = await window.electronAPI?.getKeybinding();
            if (keybinding) {
                setCurrentKeybinding(keybinding);
            }
        } catch (err) {
            console.error('Failed to load keybinding:', err);
        }
    };

    const formatKeybinding = (e: KeyboardEvent): string => {
        const parts: string[] = [];

        // Use Electron accelerator format (Alt, not Option) for registration
        if (e.ctrlKey) parts.push('Ctrl');
        if (e.altKey) parts.push('Alt');
        if (e.shiftKey) parts.push('Shift');
        if (e.metaKey) parts.push(isMac ? 'Command' : 'Super');

        // Get the actual key
        const key = e.key;
        
        // Ignore if just modifiers
        if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
            // Format the key name properly
            if (key.length === 1) {
                parts.push(key.toUpperCase());
            } else {
                parts.push(key);
            }
        }

        return parts.join('+');
    };

    const validateKeybinding = (binding: string): boolean => {
        // Must have at least one modifier
        const hasModifier = binding.includes('Ctrl') || 
                           binding.includes('Alt') || 
                           binding.includes('Shift') || 
                           binding.includes('Command');
        
        if (!hasModifier) {
            setError('Keybinding must include at least one modifier key (Ctrl, Alt, Shift, or Command)');
            return false;
        }

        // Must not be just modifiers
        const parts = binding.split('+');
        const lastPart = parts[parts.length - 1];
        if (['Ctrl', 'Alt', 'Shift', 'Command'].includes(lastPart)) {
            setError('Keybinding must include a non-modifier key');
            return false;
        }

        // Check for common system shortcuts to warn user
        const systemShortcuts = [
            'Alt+F4', 'Ctrl+Alt+Delete', 'Command+Q', 'Command+W'
        ];
        if (systemShortcuts.includes(binding)) {
            setError('This is a system shortcut and may not work');
            return false;
        }

        setError('');
        return true;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (!isRecording) return;
        
        e.preventDefault();
        e.stopPropagation();

        const binding = formatKeybinding(e);
        
        if (binding) {
            setNewKeybinding(binding);
            validateKeybinding(binding);
        }
    };

    const startRecording = () => {
        setIsRecording(true);
        setNewKeybinding('');
        setError('');
        recorderRef.current?.focus();
    };

    const stopRecording = () => {
        setIsRecording(false);
    };

    const handleSave = async () => {
        if (!newKeybinding) {
            setError('Please record a keybinding first');
            return;
        }

        if (!validateKeybinding(newKeybinding)) {
            return;
        }

        setIsSaving(true);
        try {
            const success = await window.electronAPI?.setKeybinding(newKeybinding);
            if (success) {
                setCurrentKeybinding(newKeybinding);
                setNewKeybinding('');
                setIsRecording(false);
                onClose();
            } else {
                setError('Failed to register keybinding. It may conflict with another application.');
            }
        } catch (err) {
            setError('Failed to save keybinding');
            console.error('Save keybinding error:', err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = async () => {
        setIsSaving(true);
        try {
            const defaultKeybinding = await window.electronAPI?.resetKeybinding();
            if (defaultKeybinding) {
                setCurrentKeybinding(defaultKeybinding);
                setNewKeybinding('');
                setIsRecording(false);
                setError('');
            }
        } catch (err) {
            setError('Failed to reset keybinding');
            console.error('Reset keybinding error:', err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        setNewKeybinding('');
        setIsRecording(false);
        setError('');
        onClose();
    };

    useEffect(() => {
        if (isRecording && recorderRef.current) {
            const handleKeyDownWrapper = (e: Event) => handleKeyDown(e as KeyboardEvent);
            recorderRef.current.addEventListener('keydown', handleKeyDownWrapper);
            return () => {
                recorderRef.current?.removeEventListener('keydown', handleKeyDownWrapper);
            };
        }
    }, [isRecording]);

    // ESC key to close modal
    useEffect(() => {
        if (!isOpen) return;
        
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                console.log('ESC pressed - closing modal');
                handleCancel();
            }
        };

        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [isOpen]);

    if (!isOpen) return null;

    const handleBackdropClick = (e: React.MouseEvent) => {
        // Only close if clicking directly on backdrop, not on modal content
        if (e.target === e.currentTarget) {
            console.log('Backdrop direct click - closing');
            handleCancel();
        }
    };

    return (
        <div 
            className="fixed inset-0 flex items-center justify-center animate-fade-in" 
            style={{ 
                zIndex: 999999,
                pointerEvents: 'auto',
                WebkitAppRegion: 'no-drag',
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                backdropFilter: 'blur(4px)'
            } as any}
            onClick={handleBackdropClick}
            onMouseDown={handleBackdropClick}
        >
            
            {/* Modal */}
            <div 
                style={{ 
                    position: 'relative',
                    background: 'rgba(10, 10, 12, 0.9)',
                    backdropFilter: 'blur(30px)',
                    borderRadius: '1rem',
                    padding: '1.5rem',
                    width: '460px',
                    maxWidth: '90vw',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.08)',
                    pointerEvents: 'auto',
                    WebkitAppRegion: 'no-drag',
                    zIndex: 1000000
                } as any}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                className="animate-scale-in"
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/5 rounded-lg border border-white/5">
                            <svg className="w-4 h-4 text-white/90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </div>
                        <h2 className="text-lg font-medium text-white/90 tracking-wide">Settings</h2>
                    </div>
                    <button
                        onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleCancel();
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            handleCancel();
                        }}
                        className="force-clickable text-white/40 hover:text-white/80 transition-colors p-1"
                        style={{ 
                            pointerEvents: 'auto', 
                            cursor: 'pointer',
                            WebkitAppRegion: 'no-drag',
                            zIndex: 10001
                        } as any}
                        type="button"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ pointerEvents: 'none' }}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Keybinding Section */}
                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-white/80 mb-1.5">
                            Global Keybinding
                        </label>
                        <p className="text-[13px] text-white/40 leading-relaxed font-light">
                            Set a keyboard shortcut to trigger HaloAI from anywhere in your OS.
                        </p>
                    </div>

                    {/* Current Keybinding */}
                    <div className="flex items-center justify-between p-4 bg-white/[0.03] rounded-xl border border-white/[0.06]">
                        <span className="text-sm text-white/50 font-light">Current Shortcut</span>
                        <kbd className="px-3 py-1.5 bg-white/10 rounded-lg text-white font-medium text-sm tracking-wide border border-white/5 min-w-[80px] text-center">
                            {displayKeybinding(currentKeybinding)}
                        </kbd>
                    </div>

                    {/* Keybinding Recorder */}
                    {!isRecording && !newKeybinding && (
                        <button
                            onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                startRecording();
                            }}
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                startRecording();
                            }}
                            className="force-clickable w-full px-4 py-3 bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/10 rounded-xl text-white/80 font-medium transition-all text-sm group"
                            style={{ 
                                pointerEvents: 'auto', 
                                cursor: 'pointer',
                                WebkitAppRegion: 'no-drag'
                            } as any}
                            type="button"
                        >
                            <span className="group-hover:text-white transition-colors">Record New Shortcut</span>
                        </button>
                    )}

                    {isRecording && (
                        <div
                            ref={recorderRef}
                            tabIndex={0}
                            className="w-full px-4 py-3 bg-white/[0.03] border border-white/20 rounded-xl text-center animate-pulse focus:outline-none focus:border-white/40 transition-colors"
                        >
                            <p className="text-white/90 text-sm font-medium">
                                Press keys now...
                            </p>
                        </div>
                    )}

                    {newKeybinding && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-4 bg-white/[0.05] rounded-xl border border-white/10">
                                <span className="text-sm text-white/50">New Shortcut</span>
                                <kbd className="px-3 py-1.5 bg-white text-black rounded-lg font-medium text-sm tracking-wide shadow-sm">
                                    {displayKeybinding(newKeybinding)}
                                </kbd>
                            </div>
                            {!error && (
                                <button
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        stopRecording();
                                    }}
                                    className="force-clickable w-full px-4 py-2 text-white/40 hover:text-white text-xs transition-all uppercase tracking-wider font-medium"
                                    style={{ 
                                        pointerEvents: 'auto', 
                                        cursor: 'pointer',
                                        WebkitAppRegion: 'no-drag'
                                    } as any}
                                    type="button"
                                >
                                    Cancel Recording
                                </button>
                            )}
                        </div>
                    )}

                    {/* Error Message */}
                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/10 rounded-lg">
                            <p className="text-red-300 text-xs">{error}</p>
                        </div>
                    )}

                    <div className="pt-2"></div>

                    {/* Footer Actions */}
                    <div className="flex gap-3">
                        <button
                            onMouseDown={(e) => {
                                if (!newKeybinding || error || isSaving) return;
                                e.preventDefault();
                                e.stopPropagation();
                                handleSave();
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (!newKeybinding || error || isSaving) return;
                                handleSave();
                            }}
                            disabled={!newKeybinding || !!error || isSaving}
                            className={`force-clickable flex-1 px-4 py-3 rounded-xl font-medium transition-all text-sm ${
                                !newKeybinding || !!error || isSaving
                                    ? 'bg-white/5 text-white/30 cursor-not-allowed' 
                                    : 'bg-white text-black hover:bg-white/90 shadow-lg shadow-white/5'
                            }`}
                            style={{ 
                                pointerEvents: 'auto', 
                                cursor: (!newKeybinding || error || isSaving) ? 'not-allowed' : 'pointer',
                                WebkitAppRegion: 'no-drag'
                            } as any}
                            type="button"
                        >
                            {isSaving ? 'Saving...' : 'Confirm Change'}
                        </button>
                    </div>

                    <div className="flex justify-center pt-2">
                        <button
                            onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleReset();
                            }}
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleReset();
                            }}
                            disabled={isSaving}
                            className="force-clickable text-xs text-white/20 hover:text-white/50 transition-colors"
                            style={{ 
                                pointerEvents: 'auto', 
                                cursor: isSaving ? 'not-allowed' : 'pointer',
                                WebkitAppRegion: 'no-drag'
                            } as any}
                            type="button"
                        >
                            Reset default ({displayKeybinding(DEFAULT_KEYBINDING)})
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
