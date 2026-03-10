import { useState, useEffect, useRef } from 'react';
import './styles/App.css';
import ApiKeyManager from './components/ApiKeyManager';
import CameraInterface from './components/CameraInterface';
import { useApiKey } from './hooks/useApiKey';
import { validateApiKey } from './api/gemini';

function App() {
  const { keys, addKey, deleteKey, toggleActive, activeKey } = useApiKey();
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [appMode, setAppMode] = useState<'upload' | 'camera'>('upload');
  const lastValidatedKey = useRef<string | null>(null);
  
  // Dynamic Scaling State
  const [windowSize, setWindowSize] = useState({ 
    width: window.innerWidth, 
    height: window.innerHeight 
  });

  // Model Config State
  const [modelConfig, setModelConfig] = useState(() => (window as any).AiCamaraConfig?.config || { aspectRatio: '16:9', imageSize: '1K' });

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

  const updateAspectRatio = (ratio: string) => {
    (window as any).AiCamaraConfig?.setAspectRatio(ratio);
    setModelConfig({ ...modelConfig, aspectRatio: ratio });
  };

  const updateImageSize = (size: string) => {
    (window as any).AiCamaraConfig?.setImageSize(size);
    setModelConfig({ ...modelConfig, imageSize: size });
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
            onClick={() => setAppMode(appMode === 'upload' ? 'camera' : 'upload')}
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
          appMode={appMode}
        />
        
        {isConfigOpen && (
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
                    onClick={() => updateAspectRatio(ratio)}
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
                    onClick={() => updateImageSize(size)}
                    style={{ fontSize: `calc(0.6rem * var(--ui-scale))` }}
                  >
                    {size}
                  </button>
                ))}
              </div>
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
