import type {
    LLMConfig,
    ChatCompletionRequest,
    ChatCompletionResponse,
    Message,
    StreamChunk,
} from './types';

const ZAI_BASE_URL = 'https://api.z.ai/api/coding/paas/v4';
const ZAI_MODEL = 'GLM-5.1';
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const GROQ_MODEL = 'llama3-70b-8192';
const DEFAULT_TIMEOUT_MS = 10000;

interface LLMError extends Error {
    status?: number;
}

function isRetryableError(error: unknown): boolean {
    if (error instanceof DOMException && error.name === 'AbortError') return true;
    if (error instanceof TypeError) return true;
    if (error instanceof Error) {
        const status = (error as LLMError).status;
        if (typeof status === 'number') {
            return status >= 500 || status === 408 || status === 429;
        }
    }
    return false;
}

function createLLMError(message: string, status?: number): LLMError {
    const error: LLMError = new Error(message);
    error.status = status;
    return error;
}

export class LLMClient {
    private zaiApiKey: string;
    private zaiBaseUrl: string;
    private zaiModel: string;
    private groqApiKey: string;
    private groqBaseUrl: string;
    private groqModel: string;
    private timeoutMs: number;

    constructor(config: LLMConfig) {
        if (!config.zai?.apiKey) {
            throw new Error('Z.ai API key is required');
        }
        if (!config.groq?.apiKey) {
            throw new Error('Groq API key is required for fallback');
        }

        this.zaiApiKey = config.zai.apiKey;
        this.zaiBaseUrl = config.zai.baseUrl || ZAI_BASE_URL;
        this.zaiModel = config.zai.model || ZAI_MODEL;
        this.groqApiKey = config.groq.apiKey;
        this.groqBaseUrl = config.groq.baseUrl || GROQ_BASE_URL;
        this.groqModel = config.groq.model || GROQ_MODEL;
        this.timeoutMs = config.timeoutMs || DEFAULT_TIMEOUT_MS;
    }

    private async makeRequest(
        url: string,
        apiKey: string,
        model: string,
        messages: Message[],
        stream: boolean,
        options?: Partial<ChatCompletionRequest>
    ): Promise<Response> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
            const response = await fetch(`${url}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    messages,
                    stream,
                    temperature: 0.7,
                    max_tokens: 4096,
                    ...options,
                }),
                signal: controller.signal,
            });
            return response;
        } finally {
            clearTimeout(timeout);
        }
    }

    private parseStreamChunk(chunk: string): string | null {
        const lines = chunk.split('\n');
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') return null;
                try {
                    const parsed: StreamChunk = JSON.parse(data);
                    return parsed.choices[0]?.delta?.content || null;
                } catch {
                    continue;
                }
            }
        }
        return null;
    }

    async chat(messages: Message[], options?: Partial<ChatCompletionRequest>): Promise<ChatCompletionResponse> {
        try {
            const response = await this.makeRequest(this.zaiBaseUrl, this.zaiApiKey, this.zaiModel, messages, false, options);

            if (!response.ok) {
                const errorBody = await response.text();
                throw createLLMError(`Z.ai API error: ${response.status} - ${errorBody}`, response.status);
            }

            return response.json() as Promise<ChatCompletionResponse>;
        } catch (primaryError) {
            if (isRetryableError(primaryError)) {
                console.warn('[LLMClient] Z.ai failed (retryable), falling back to Groq...', primaryError);
                return this.fallbackChat(messages, options);
            }
            throw primaryError;
        }
    }

    private async fallbackChat(messages: Message[], options?: Partial<ChatCompletionRequest>): Promise<ChatCompletionResponse> {
        const response = await this.makeRequest(this.groqBaseUrl, this.groqApiKey, this.groqModel, messages, false, options);

        if (!response.ok) {
            const errorBody = await response.text();
            throw createLLMError(`Groq fallback error: ${response.status} - ${errorBody}`, response.status);
        }

        return response.json() as Promise<ChatCompletionResponse>;
    }

    async *chatStream(
        messages: Message[],
        options?: Partial<ChatCompletionRequest>
    ): AsyncGenerator<string> {
        try {
            yield* this.streamFromProvider(this.zaiBaseUrl, this.zaiApiKey, this.zaiModel, messages, options);
        } catch (primaryError) {
            if (isRetryableError(primaryError)) {
                console.warn('[LLMClient] Z.ai stream failed (retryable), falling back to Groq...', primaryError);
                yield* this.streamFromProvider(this.groqBaseUrl, this.groqApiKey, this.groqModel, messages, options);
            } else {
                throw primaryError;
            }
        }
    }

    private async *streamFromProvider(
        url: string,
        apiKey: string,
        model: string,
        messages: Message[],
        options?: Partial<ChatCompletionRequest>
    ): AsyncGenerator<string> {
        const response = await this.makeRequest(url, apiKey, model, messages, true, options);

        if (!response.ok) {
            const errorBody = await response.text();
            throw createLLMError(`API error: ${response.status} - ${errorBody}`, response.status);
        }

        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const content = this.parseStreamChunk(line);
                if (content) {
                    yield content;
                }
            }
        }
    }

    async codeAssist(code: string, question: string): Promise<string> {
        const response = await this.chat([
            {
                role: 'system',
                content: `You are a helpful coding assistant. Analyze the code and answer questions about it. 
        Be concise but thorough. Format code in markdown code blocks with appropriate language tags.`,
            },
            {
                role: 'user',
                content: `Here's the code:\n\`\`\`\n${code}\n\`\`\`\n\nQuestion: ${question}`,
            },
        ]);

        return response.choices[0]?.message?.content || 'No response generated';
    }

    async analyzeScreenshot(imageBase64: string, question: string = 'What do you see in this screenshot?'): Promise<string> {
        const response = await this.chat([
            {
                role: 'system',
                content: `You are a helpful AI assistant analyzing screenshots. 
        Describe what you see and provide helpful suggestions or answers.`,
            },
            {
                role: 'user',
                content: `[Screenshot attached]\n\n${question}\n\nNote: Image data: ${imageBase64.substring(0, 100)}...`,
            },
        ]);

        return response.choices[0]?.message?.content || 'Unable to analyze screenshot';
    }

    async writeAssist(text: string, instruction: string): Promise<string> {
        const response = await this.chat([
            {
                role: 'system',
                content: `You are a helpful writing assistant. Help improve, edit, or rewrite text based on instructions.
        Maintain the original tone unless asked to change it. Be concise and direct.`,
            },
            {
                role: 'user',
                content: `Text:\n${text}\n\nInstruction: ${instruction}`,
            },
        ]);

        return response.choices[0]?.message?.content || 'No response generated';
    }
}
