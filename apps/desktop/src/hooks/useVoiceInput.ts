import { useState, useRef, useCallback, useEffect } from 'react';

interface UseVoiceInputOptions {
    onTranscript?: (text: string, isFinal: boolean) => void;
    onError?: (error: string) => void;
}

export function useVoiceInput(options: UseVoiceInputOptions = {}) {
    const [isRecording, setIsRecording] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [error, setError] = useState<string | null>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const socketRef = useRef<WebSocket | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const startRecording = useCallback(async () => {
        const apiKey = import.meta.env.VITE_DEEPGRAM_API_KEY;

        if (!apiKey) {
            // Demo mode - simulate voice input
            setIsRecording(true);
            setTranscript('');

            // Simulate transcription after 2 seconds
            setTimeout(() => {
                const demoText = "This is a demo transcription. Add your Deepgram API key for real voice input.";
                setTranscript(demoText);
                options.onTranscript?.(demoText, true);
                setIsRecording(false);
            }, 2000);

            return;
        }

        try {
            // Request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            // Connect to Deepgram WebSocket
            const socket = new WebSocket(
                'wss://api.deepgram.com/v1/listen?model=nova-2&language=en&punctuate=true&smart_format=true',
                ['token', apiKey]
            );
            socketRef.current = socket;

            socket.onopen = () => {
                setIsRecording(true);
                setTranscript('');
                setError(null);

                // Create MediaRecorder
                const mediaRecorder = new MediaRecorder(stream, {
                    mimeType: 'audio/webm',
                });
                mediaRecorderRef.current = mediaRecorder;

                mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
                        socket.send(event.data);
                    }
                };

                mediaRecorder.start(250); // Send chunks every 250ms
            };

            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    const transcriptText = data.channel?.alternatives?.[0]?.transcript;
                    const isFinal = data.is_final;

                    if (transcriptText) {
                        if (isFinal) {
                            setTranscript((prev) => prev + transcriptText + ' ');
                            options.onTranscript?.(transcriptText, true);
                        } else {
                            options.onTranscript?.(transcriptText, false);
                        }
                    }
                } catch (error) {
                    // Never throw - ignore parse errors silently
                    console.error('[VoiceInput] WebSocket message parse error:', error);
                }
            };

            socket.onerror = (error) => {
                console.error('[VoiceInput] WebSocket error:', error);
                const errMsg = 'Voice connection error';
                setError(errMsg);
                options.onError?.(errMsg);
                stopRecording();
            };

            socket.onclose = () => {
                setIsRecording(false);
            };
        } catch (err) {
            // Never throw - always set error state
            const errMsg = err instanceof Error ? err.message : 'Microphone access denied';
            console.error('[VoiceInput] startRecording error:', errMsg);
            setError(errMsg);
            options.onError?.(errMsg);
        }
    }, [options]);

    const stopRecording = useCallback(() => {
        try {
            // Stop MediaRecorder
            if (mediaRecorderRef.current?.state !== 'inactive') {
                mediaRecorderRef.current?.stop();
            }
            mediaRecorderRef.current = null;

            // Close WebSocket
            if (socketRef.current?.readyState === WebSocket.OPEN) {
                socketRef.current.close();
            }
            socketRef.current = null;

            // Stop media stream
            streamRef.current?.getTracks().forEach((track) => track.stop());
            streamRef.current = null;

            setIsRecording(false);
        } catch (error) {
            // Never throw - log and continue
            console.error('[VoiceInput] stopRecording error:', error);
            setIsRecording(false);
        }
    }, []);

    const toggleRecording = useCallback(() => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    }, [isRecording, startRecording, stopRecording]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopRecording();
        };
    }, [stopRecording]);

    return {
        isRecording,
        transcript,
        error,
        startRecording,
        stopRecording,
        toggleRecording,
    };
}
