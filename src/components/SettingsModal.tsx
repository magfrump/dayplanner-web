import React, { useState } from 'react';
import { X, Save } from 'lucide-react';
import { getAvailableProviders, getProvider } from '../services/llm';
import type { LLMConfig } from '../services/types';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (config: LLMConfig) => void;
    currentConfig: LLMConfig;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSave, currentConfig }) => {
    const [providerId, setProviderId] = useState(currentConfig.provider);

    // Initialize derived state correctly
    const [allConfigs, setAllConfigs] = useState<Record<string, Record<string, string>>>(() => {
        const cfgs = { ...(currentConfig.providerConfigs || {}) };
        if (currentConfig.config) {
            // Avoid mutation of the incoming prop object if it was frozen (though likely not), but good practice
            cfgs[currentConfig.provider] = { ...cfgs[currentConfig.provider], ...currentConfig.config };
        }
        return cfgs;
    });

    const [currentValues, setCurrentValues] = useState<Record<string, string>>(() => {
        const cfgs = currentConfig.providerConfigs || {};
        const configToUse = cfgs[currentConfig.provider] || currentConfig.config || {};
        // Merge with active config if available just to be safe, logic from previous implementation
        return { ...configToUse, ...(currentConfig.provider === currentConfig.provider ? currentConfig.config : {}) };
        // Actually the original logic was: cfgs[currentConfig.provider] || currentConfig.config || {}
        // But the side-effect block did: cfgs[currentConfig.provider] = ... merge ...
        // So we should replicate that merge logic for the initial value
    });

    // Reset logic removed as component now mounts on open

    // When providerId changes, switch the values shown
    const handleProviderChange = (newId: string) => {
        // Save current values to temp map
        setAllConfigs(prev => ({
            ...prev,
            [providerId]: currentValues
        }));

        setProviderId(newId);
        // Load new values
        setCurrentValues(allConfigs[newId] || {});
    };

    if (!isOpen) return null;

    const provider = getProvider(providerId);
    const availableProviders = getAvailableProviders();

    const handleSave = () => {
        // Ensure current edits are captured
        const updatedConfigs = {
            ...allConfigs,
            [providerId]: currentValues
        };

        onSave({
            provider: providerId,
            config: currentValues,
            providerConfigs: updatedConfigs,
            stylePrompt: currentValues.stylePrompt // Save root level
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 transition-opacity">
            <div className="bg-white/95 backdrop-blur-md border border-gray-200 rounded-2xl shadow-2xl p-6 w-[500px] max-w-full m-4 transform transition-all scale-100">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">Settings</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                        <X size={24} />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Provider</label>
                        <select
                            value={providerId}
                            onChange={(e) => handleProviderChange(e.target.value)}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white transition-all"
                        >
                            {availableProviders.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>



                    <div>
                        <label className="block text-sm font-medium mb-1">Custom Style / System Instructions</label>
                        <textarea
                            value={currentValues.stylePrompt || ''}
                            onChange={(e) => setCurrentValues(prev => ({ ...prev, stylePrompt: e.target.value }))}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white transition-all h-24 resize-none"
                            placeholder="E.g., 'Be concise', 'Talk like a pirate', 'Focus on time blocking'..."
                        />
                    </div>

                    <div className="space-y-3 border-t pt-3">
                        {provider.requiredFields.map(field => (
                            <div key={field.key}>
                                <label className="block text-sm font-medium mb-1">{field.label}</label>
                                <input
                                    type={field.type}
                                    value={currentValues[field.key] || ''}
                                    onChange={(e) => setCurrentValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white transition-all"
                                    placeholder={`Enter ${field.label}`}
                                />
                            </div>
                        ))}
                    </div>

                    <div className="pt-4 flex justify-end gap-2">
                        <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">
                            Cancel
                        </button>
                        <button onClick={handleSave} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-md flex items-center gap-2 transition-colors">
                            <Save size={18} />
                            Save
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
