import { useState, useEffect } from 'react';

export interface ApiKeyEntry {
  id: string;
  name: string;
  key: string;
  isActive: boolean;
}

const STORAGE_KEY = 'ai_camara_api_keys';

export const useApiKey = () => {
  const [keys, setKeys] = useState<ApiKeyEntry[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  }, [keys]);

  const addKey = (name: string, key: string) => {
    const newKey: ApiKeyEntry = {
      id: crypto.randomUUID(),
      name,
      key,
      isActive: keys.length === 0, // Auto-activate if it's the first key
    };
    setKeys(prev => [...prev, newKey]);
  };

  const deleteKey = (id: string) => {
    setKeys(prev => prev.filter(k => k.id !== id));
  };

  const toggleActive = (id: string) => {
    setKeys(prev => prev.map(k => ({
      ...k,
      isActive: k.id === id,
    })));
  };

  const getActiveKey = () => {
    return keys.find(k => k.isActive)?.key || null;
  };

  return {
    keys,
    addKey,
    deleteKey,
    toggleActive,
    activeKey: getActiveKey(),
  };
};
