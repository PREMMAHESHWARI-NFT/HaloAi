import { useState, useCallback, useRef } from 'react';
import { createWorker } from 'tesseract.js';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const VISION_MODEL = 'meta-llama/llama-3.2-11b-vision-instruct:free'; // Llama vision model

const DEBOUNCE_MS = 3000;

export function useVision() {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const lastAnalysisRef = useRef<number>(0);
    const cachedResultRef = useRef<string>('');

    const analyzeWithOCR = useCallback(async (screenshotDataUrl: string): Promise<string> => {
        try {
            console.log('[Vision] Falling back to OCR (Tesseract)...');

            const worker = await createWorker('eng');
            const { data } = await worker.recognize(screenshotDataUrl);
            await worker.terminate();

            const extractedText = data.text.trim();

            if (extractedText) {
                console.log('[Vision] OCR extracted', extractedText.length, 'characters');
                return `Screen text extracted via OCR:\n\n${extractedText}`;
            } else {
                console.warn('[Vision] OCR found no text');
                return '[Screenshot captured but no text could be extracted]';
            }
        } catch (error) {
            // Never throw - always return safe fallback
            console.error('[Vision] OCR error:', error);
            if (error instanceof Error) {
                console.error('[Vision] OCR error message:', error.message);
            }
            return '[Screenshot captured but OCR failed]';
        }
    }, []);

    const analyzeWithOpenRouter = useCallback(async (screenshotDataUrl: string): Promise<string | null> => {
        const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;

        if (!apiKey) {
            console.warn('[Vision] No OpenRouter API key, skipping OpenRouter');
            return null;
        }

        try {
            console.log('[Vision] Trying OpenRouter vision model...');

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

            const response = await fetch(OPENROUTER_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'https://haloai.app',
                    'X-Title': 'HaloAI',
                },
                signal: controller.signal,
                body: JSON.stringify({
                    model: VISION_MODEL,
                    messages: [
                        {
                            role: 'user',
                            content: [
                                {
                                    type: 'text',
                                    text: `Analyze this screenshot in detail. Describe:
1. What application/interface is shown
2. Any visible text, code, or errors
3. UI elements, buttons, layout
4. Anything notable or problematic

Be specific and thorough.`
                                },
                                {
                                    type: 'image_url',
                                    image_url: {
                                        url: screenshotDataUrl
                                    }
                                }
                            ]
                        }
                    ],
                    max_tokens: 500,
                    temperature: 0.3,
                }),
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();

                // Check if rate limited
                if (response.status === 429) {
                    console.warn('[Vision] OpenRouter rate-limited (429), falling back to OCR');
                    return null; // Signal to use OCR fallback
                }

                console.error('[Vision] OpenRouter error:', response.status, errorText);
                return null; // Signal to use OCR fallback
            }

            const data = await response.json();
            const visionDescription = data.choices?.[0]?.message?.content;

            if (visionDescription) {
                console.log('[Vision] OpenRouter success:', visionDescription.slice(0, 100) + '...');
                return visionDescription;
            }

            return null;

        } catch (error) {
            // Never throw - always return null to trigger OCR fallback
            if (error instanceof Error && error.name === 'AbortError') {
                console.warn('[Vision] OpenRouter request timed out after 15s');
            } else {
                console.error('[Vision] OpenRouter network error:', error);
                if (error instanceof Error) {
                    console.error('[Vision] OpenRouter error message:', error.message);
                }
            }
            return null; // Signal to use OCR fallback
        }
    }, []);

    const analyzeScreenshot = useCallback(async (screenshotDataUrl: string): Promise<string> => {
        // Debounce: if called within 3s of last analysis, return cached result
        const now = Date.now();
        if (now - lastAnalysisRef.current < DEBOUNCE_MS && cachedResultRef.current) {
            console.log('[Vision] Debounced — returning cached result');
            return cachedResultRef.current;
        }

        setIsAnalyzing(true);

        try {
            // Try OpenRouter visual model first
            const openRouterResult = await analyzeWithOpenRouter(screenshotDataUrl);

            if (openRouterResult) {
                lastAnalysisRef.current = Date.now();
                cachedResultRef.current = openRouterResult;
                return openRouterResult;
            }

            // OpenRouter failed or rate-limited, fall back to OCR
            const ocrResult = await analyzeWithOCR(screenshotDataUrl);
            lastAnalysisRef.current = Date.now();
            cachedResultRef.current = ocrResult;
            return ocrResult;

        } catch (error) {
            // Never throw - always return safe fallback message
            console.error('[Vision] Error analyzing screenshot:', error);
            if (error instanceof Error) {
                console.error('[Vision] Error message:', error.message);
                console.error('[Vision] Error stack:', error.stack);
            }
            return '[Vision analysis failed - proceeding without visual context]';
        } finally {
            setIsAnalyzing(false);
        }
    }, [analyzeWithOpenRouter, analyzeWithOCR]);

    return { analyzeScreenshot, isAnalyzing };
}
