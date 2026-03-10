import { useState, useEffect, useRef } from 'react';
import './styles/App.css';
import ApiKeyManager from './components/ApiKeyManager';
import CameraInterface from './components/CameraInterface';
import { useApiKey } from './hooks/useApiKey';
import { validateApiKey, PRESET_FILTERS } from './api/gemini';

function App() {
  const { keys, addKey, deleteKey, toggleActive, activeKey } = useApiKey();
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [appMode, setAppMode] = useState<'upload' | 'camera'>('upload');
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingConfig, setPendingConfig] = useState<any>(null);
  const lastValidatedKey = useRef<string | null>(null);
  
  // Dynamic Scaling State
  const [windowSize, setWindowSize] = useState({ 
    width: window.innerWidth, 
    height: window.innerHeight 
  });

  // Model Config State
  const [modelConfig, setModelConfig] = useState(() => (window as any).AiCamaraConfig?.config || { 
    aspectRatio: '16:9', 
    imageSize: '1K',
    filterId: 'none',
    customFilterDescription: ''
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const checkKey = async () => {
      if (activeKey === lastValidatedKey.current && isValid !== null) return;
      if (!activeKey) {
        setIsValid(false);
        lastValidatedKey.current = null;
        return;
      }
      setIsValid(null);
      lastValidatedKey.current = activeKey;
      const result = await validateApiKey(activeKey);
      setIsValid(result.valid);
    };
    checkKey();
  }, [activeKey, isValid]);

  const toggleConfig = () => setIsConfigOpen(!isConfigOpen);

  const requestConfigUpdate = (partial: any) => {
    if (isProcessing) {
      setPendingConfig(partial);
    } else {
      applyConfigUpdate(partial);
    }
  };

  const applyConfigUpdate = (partial: any) => {
    if (partial.appMode) {
      setAppMode(partial.appMode);
    } else {
      const newConfig = (window as any).AiCamaraConfig?.updateConfig(partial);
      if (newConfig) setModelConfig(newConfig);
    }
    setPendingConfig(null);
  };

  const handleAbortDecision = (confirm: boolean) => {
    if (confirm && pendingConfig) {
      applyConfigUpdate(pendingConfig);
    } else {
      setPendingConfig(null);
      setIsConfigOpen(false);
    }
  };

  // Calculate UI Scale factor based on window size
  const isPortrait = windowSize.height > windowSize.width;
  const scaleBase = isPortrait ? windowSize.width : windowSize.height;
  const uiScale = Math.min(Math.max(scaleBase / 600, 0.7), 1.3);

  const dynamicStyles = {
    '--ui-scale': uiScale,
    '--vh': `${windowSize.height * 0.01}px`
  } as React.CSSProperties;

  return (
    <div className="app-container" style={dynamicStyles}>
      <header className="header">
        <h1 style={{ fontSize: `calc(1rem * var(--ui-scale))` }}>AI_CAMARA // V.0.1</h1>
        <div className="header-controls">
          <button 
            className={`config-trigger-header ${appMode === 'camera' ? 'active' : ''}`} 
            onClick={() => requestConfigUpdate({ appMode: appMode === 'upload' ? 'camera' : 'upload' })}
            style={{ fontSize: `calc(0.6rem * var(--ui-scale))` }}
          >
            {appMode === 'upload' ? '[ USE CAMERA ]' : '[ USE UPLOAD ]'}
          </button>
          <button 
            className={`config-trigger-header ${isConfigOpen ? 'active' : ''}`} 
            onClick={toggleConfig}
            style={{ fontSize: `calc(0.6rem * var(--ui-scale))` }}
          >
            [ SETTINGS ]
          </button>
          <div style={{ color: isValid ? 'var(--camera-accent)' : 'var(--camera-danger)', fontSize: `calc(0.7rem * var(--ui-scale))` }}>
            {isValid === null ? '[ VALIDATING ]' : (isValid ? '[ ONLINE ]' : '[ OFFLINE ]')}
          </div>
        </div>
      </header>

      <main style={{ display: 'flex', flexDirection: 'column', flex: 1, position: 'relative', minHeight: 0 }}>
        <CameraInterface 
          apiKey={isValid ? activeKey : null} 
          aspectRatio={modelConfig.aspectRatio}
          filterId={modelConfig.filterId}
          imageSize={modelConfig.imageSize}
          appMode={appMode}
          onProcessingChange={setIsProcessing}
        />
        
        {pendingConfig && (
          <div className="error-popup" style={{ zIndex: 400, borderColor: 'var(--camera-accent)' }}>
            <div className="error-icon" style={{ borderColor: 'var(--camera-accent)', color: 'var(--camera-accent)' }}>!</div>
            <div className="error-title" style={{ color: 'var(--camera-accent)' }}>ABORT GENERATION?</div>
            <div className="error-msg">
              Changing settings will stop the current AI process. 
              Do you want to proceed and lose current progress?
            </div>
            <button className="error-btn" style={{ background: 'var(--camera-accent)', color: 'black' }} onClick={() => handleAbortDecision(true)}>PROCEED & ABORT</button>
            <button className="error-btn secondary" onClick={() => handleAbortDecision(false)}>CANCEL</button>
          </div>
        )}

        {isConfigOpen && !pendingConfig && (
          <div className="config-overlay">
            <div className="config-header">
              <div style={{ fontSize: `calc(0.9rem * var(--ui-scale))`, letterSpacing: '2px' }}>SYSTEM SETTINGS</div>
              <button className="config-close-btn" onClick={() => setIsConfigOpen(false)}>×</button>
            </div>

            <div className="config-section">
              <label className="config-label">ASPECT RATIO</label>
              <div className="config-options">
                {["1:1", "16:9", "9:16", "4:3", "3:4"].map(ratio => (
                  <button 
                    key={ratio} 
                    className={`config-btn ${modelConfig.aspectRatio === ratio ? 'active' : ''}`}
                    onClick={() => requestConfigUpdate({ aspectRatio: ratio })}
                    style={{ fontSize: `calc(0.6rem * var(--ui-scale))` }}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>

            <div className="config-section">
              <label className="config-label">GENERATION QUALITY (SIZE)</label>
              <div className="config-options">
                {["1K", "2K", "4K"].map(size => (
                  <button 
                    key={size} 
                    className={`config-btn ${modelConfig.imageSize === size ? 'active' : ''}`}
                    onClick={() => requestConfigUpdate({ imageSize: size })}
                    style={{ fontSize: `calc(0.6rem * var(--ui-scale))` }}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            <div className="config-section">
              <label className="config-label">AI FILTER</label>
              <div className="config-options">
                {PRESET_FILTERS.map(filter => (
                  <button 
                    key={filter.id} 
                    className={`config-btn ${modelConfig.filterId === filter.id ? 'active' : ''}`}
                    onClick={() => requestConfigUpdate({ filterId: filter.id })}
                    style={{ fontSize: `calc(0.6rem * var(--ui-scale))` }}
                  >
                    {filter.name}
                  </button>
                ))}
              </div>
              {modelConfig.filterId === 'custom' && (
                <textarea 
                  className="input-field" 
                  style={{ marginTop: '10px', height: '60px', resize: 'none' }}
                  placeholder="Enter custom style description..."
                  value={modelConfig.customFilterDescription}
                  onChange={(e) => applyConfigUpdate({ customFilterDescription: e.target.value })}
                />
              )}
            </div>

            <div style={{ marginTop: 'auto' }}>
               <button className="error-btn" style={{ background: '#333', fontSize: `calc(0.7rem * var(--ui-scale))` }} onClick={() => setIsConfigOpen(false)}>CLOSE SETTINGS</button>
            </div>
          </div>
        )}

        <div className="api-key-drawer">
          <ApiKeyManager 
            keys={keys} 
            addKey={addKey} 
            deleteKey={deleteKey} 
            toggleActive={toggleActive} 
          />
        </div>
      </main>

      <footer style={{ marginTop: 'auto', padding: '0.5rem 0', fontSize: `calc(0.5rem * var(--ui-scale))`, color: '#555', textAlign: 'center', flexShrink: 0 }}>
        AI_CAMARA SYSTEM_0x3F42 // GEMINI_3.1_VISION_GENERATOR_CORE
      </footer>
    </div>
  );
}

export default App;
