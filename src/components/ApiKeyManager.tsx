import React, { useState } from 'react';
import type { ApiKeyEntry } from '../hooks/useApiKey';
import { validateApiKey } from '../api/gemini';

interface ApiKeyManagerProps {
  keys: ApiKeyEntry[];
  addKey: (name: string, key: string) => void;
  deleteKey: (id: string) => void;
  toggleActive: (id: string) => void;
}

const ApiKeyManager: React.FC<ApiKeyManagerProps> = ({ keys, addKey, deleteKey, toggleActive }) => {
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (name && key) {
      setIsValidating(true);
      const result = await validateApiKey(key);
      setIsValidating(false);

      if (result.valid) {
        addKey(name, key);
        setName('');
        setKey('');
      } else {
        setError(result.error || 'Validation failed');
      }
    }
  };

  return (
    <div className="api-key-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setIsExpanded(!isExpanded)}>
        <span>[ API KEY MGMT ]</span>
        <span>{isExpanded ? '[-]' : '[+]'}</span>
      </div>
      
      {isExpanded && (
        <>
          <form onSubmit={handleSubmit} style={{ marginTop: '1rem' }}>
            <input 
              className="input-field" 
              placeholder="KEY NAME (e.g. WORK)" 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              disabled={isValidating}
            />
            <input 
              className="input-field" 
              type="password" 
              placeholder="GEMINI_API_KEY" 
              value={key} 
              onChange={(e) => setKey(e.target.value)} 
              disabled={isValidating}
            />
            <button className="btn-small" type="submit" disabled={isValidating || !name || !key}>
              {isValidating ? 'VALIDATING...' : 'ADD KEY'}
            </button>
            {error && <div style={{ color: 'var(--camera-danger)', fontSize: '0.6rem', marginTop: '5px' }}>{error}</div>}
          </form>

          <ul className="key-list">
            {keys.map((k) => (
              <li key={k.id} className={`key-item ${k.isActive ? 'active' : ''}`}>
                <span>{k.name} {k.isActive ? '(ACTIVE)' : ''}</span>
                <div>
                  {!k.isActive && (
                    <button className="btn-small active" onClick={() => toggleActive(k.id)}>ACTIVATE</button>
                  )}
                  <button className="btn-small delete" onClick={() => deleteKey(k.id)}>DEL</button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
};

export default ApiKeyManager;
