export interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface ChatCompletionRequest {
    model: string;
    messages: Message[];
    stream?: boolean;
    temperature?: number;
    max_tokens?: number;
}

export interface ChatCompletionResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: {
        index: number;
        message: Message;
        finish_reason: string;
    }[];
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

export interface StreamChunk {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: {
        index: number;
        delta: {
            role?: string;
            content?: string;
        };
        finish_reason: string | null;
    }[];
}

export interface ZAIConfig {
    apiKey: string;
    baseUrl?: string;
    model?: string;
}

export interface GroqConfig {
    apiKey: string;
    baseUrl?: string;
    model?: string;
}

export interface LLMConfig {
    zai: ZAIConfig;
    groq: GroqConfig;
    timeoutMs?: number;
}
