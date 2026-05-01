import { useState, useEffect } from 'react';
import type { LLMConfig } from '../services/types';

const STORAGE_KEY = 'dayplanner_llm_config';

const loadInitialConfig = (): LLMConfig => {
    if (typeof window === 'undefined') {
        return { provider: 'anthropic', config: {}, providerConfigs: {} };
    }
    const saved = localStorage.getItem(STORAGE_KEY);
    try {
        const parsed = saved ? JSON.parse(saved) : null;
        if (parsed && !parsed.providerConfigs) {
            // Migrate old single-provider format
            return { ...parsed, providerConfigs: { [parsed.provider]: parsed.config || {} } };
        }
        return parsed || { provider: 'anthropic', config: {}, providerConfigs: {} };
    } catch {
        return { provider: 'anthropic', config: {}, providerConfigs: {} };
    }
};

export const useLLMConfig = () => {
    const [llmConfig, setLlmConfig] = useState<LLMConfig>(loadInitialConfig);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(llmConfig));
        }
    }, [llmConfig]);

    return { llmConfig, setLlmConfig };
};
